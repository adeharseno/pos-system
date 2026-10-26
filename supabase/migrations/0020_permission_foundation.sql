BEGIN;
CREATE TABLE public.permission_definitions(code text PRIMARY KEY);
CREATE TABLE public.role_permissions(
 role public.employee_position NOT NULL,
 permission_code text NOT NULL REFERENCES public.permission_definitions(code),
 PRIMARY KEY(role,permission_code));
CREATE TABLE public.employee_permission_overrides(
 employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
 permission_code text NOT NULL REFERENCES public.permission_definitions(code),
 effect text NOT NULL CHECK(effect IN ('allow','deny')),
 PRIMARY KEY(employee_id,permission_code));
CREATE TABLE public.security_audit_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_employee_id uuid REFERENCES public.employees(id) ON DELETE RESTRICT,
 action text NOT NULL,target_id text NOT NULL,before_value jsonb,after_value jsonb,reason text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX security_audit_target ON public.security_audit_events(target_id,created_at);
-- A written serialization row also forces stale REPEATABLE READ transactions to fail.
CREATE TABLE public.employee_access_guard(id boolean PRIMARY KEY CHECK(id), revision bigint NOT NULL);
INSERT INTO public.employee_access_guard VALUES(true,0);
ALTER TABLE public.employee_access_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_access_guard FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO public.permission_definitions VALUES ('dashboard.view'),('products.view'),('products.create'),('products.edit'),('products.delete'),('products.activate'),('products.units.manage'),('products.import'),('catalog.manage'),('pricing.cost.view'),('pricing.cost.edit'),('pricing.margin.view'),('pricing.selling.view'),('pricing.selling.edit'),('inventory.view'),('inventory.receive'),('inventory.opname'),('cashier.view'),('sales.checkout'),('transactions.view'),('transactions.void'),('transactions.confirm_payment'),('returns.view'),('returns.create'),('returns.supplier'),('cash_drawer.manage'),('reports.sales.view'),('reports.products.view'),('reports.payments.view'),('reports.profit.view'),('expenses.manage'),('employees.view'),('employees.create'),('employees.edit'),('employees.deactivate'),('employees.invite'),('permissions.manage'),('audit.view'),('submissions.view_own'),('submissions.create'),('submissions.edit_own'),('submissions.submit'),('submissions.review'),('submissions.approve'),('submissions.reject'),('submissions.request_revision');
INSERT INTO public.role_permissions SELECT 'owner_admin',code FROM public.permission_definitions;
-- Preserve current role behavior; new submission powers are opt-in in a later milestone.
INSERT INTO public.role_permissions VALUES
('kasir','dashboard.view'),('kasir','products.view'),('kasir','pricing.selling.view'),('kasir','inventory.view'),('kasir','cashier.view'),('kasir','sales.checkout'),('kasir','transactions.view'),('kasir','transactions.void'),('kasir','transactions.confirm_payment'),('kasir','returns.view'),('kasir','returns.create'),('kasir','cash_drawer.manage'),('staf','dashboard.view');
ALTER TABLE public.permission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.permission_definitions,public.role_permissions,public.employee_permission_overrides,public.security_audit_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.security_audit_events_id_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.permission_definitions,public.role_permissions,public.employee_permission_overrides,public.security_audit_events TO service_role;

CREATE FUNCTION public.get_employee_permissions(p_employee_id uuid,p_role public.employee_position)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=p_employee_id AND is_active AND position=p_role) THEN RAISE EXCEPTION 'EMPLOYEE_INACTIVE_OR_CHANGED'; END IF;
 RETURN jsonb_build_object(
 'definitions',(SELECT coalesce(jsonb_agg(code),'[]') FROM public.permission_definitions),
 'preset',(SELECT coalesce(jsonb_agg(permission_code),'[]') FROM public.role_permissions WHERE role=p_role),
 'overrides',(SELECT coalesce(jsonb_agg(jsonb_build_object('permission',permission_code,'effect',effect)),'[]') FROM public.employee_permission_overrides WHERE employee_id=p_employee_id));
END; $$;

-- Caller identity must come from verified Auth on the trusted server.
CREATE FUNCTION public.set_employee_permission_override(p_actor_auth_user_id uuid,p_employee_id uuid,p_permission_code text,p_effect text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor uuid; v_before jsonb; v_after jsonb;
BEGIN
 SELECT e.id INTO v_actor FROM public.employees e JOIN public.user_profiles u ON u.employee_id=e.id
 WHERE u.id=p_actor_auth_user_id AND e.is_active AND e.position='owner_admin' FOR SHARE OF e,u;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.permission_definitions WHERE code=p_permission_code) THEN RAISE EXCEPTION 'UNKNOWN_PERMISSION'; END IF;
 IF p_effect IS NOT NULL AND p_effect NOT IN ('allow','deny') THEN RAISE EXCEPTION 'INVALID_OVERRIDE'; END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.employees WHERE id=p_employee_id AND position='owner_admin') THEN RAISE EXCEPTION 'OWNER_PERMISSIONS_PROTECTED'; END IF;
 SELECT to_jsonb(o) INTO v_before FROM public.employee_permission_overrides o WHERE employee_id=p_employee_id AND permission_code=p_permission_code;
 IF p_effect IS NULL THEN
 DELETE FROM public.employee_permission_overrides WHERE employee_id=p_employee_id AND permission_code=p_permission_code;
 ELSE
 INSERT INTO public.employee_permission_overrides VALUES(p_employee_id,p_permission_code,p_effect)
 ON CONFLICT(employee_id,permission_code) DO UPDATE SET effect=excluded.effect;
 SELECT to_jsonb(o) INTO v_after FROM public.employee_permission_overrides o WHERE employee_id=p_employee_id AND permission_code=p_permission_code;
 END IF;
 IF v_before IS DISTINCT FROM v_after THEN
 INSERT INTO public.security_audit_events(actor_employee_id,action,target_id,before_value,after_value,reason)
 VALUES(v_actor,'permission.override',p_employee_id::text,v_before,v_after,btrim(p_reason));
 END IF;
END; $$;

-- Statement lock precedes row locks, serializing concurrent owner demotions/deactivations.
CREATE FUNCTION public.lock_employee_access_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.employee_access_guard SET revision=revision+1 WHERE id=true;
 RETURN NULL;
END; $$;
CREATE TRIGGER serialize_employee_access BEFORE UPDATE OR DELETE ON public.employees FOR EACH STATEMENT EXECUTE FUNCTION public.lock_employee_access_changes();
CREATE FUNCTION public.protect_last_active_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.position='owner_admin' AND OLD.is_active AND (TG_OP='DELETE' OR NEW.position<>'owner_admin' OR NOT NEW.is_active) THEN
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id<>OLD.id AND position='owner_admin' AND is_active) THEN RAISE EXCEPTION 'LAST_ACTIVE_OWNER'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER protect_last_active_owner BEFORE UPDATE OR DELETE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.protect_last_active_owner();
CREATE FUNCTION public.audit_employee_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.position IS DISTINCT FROM NEW.position OR OLD.is_active IS DISTINCT FROM NEW.is_active THEN
 INSERT INTO public.security_audit_events(action,target_id,before_value,after_value)
 VALUES('employee.access',NEW.id::text,jsonb_build_object('role',OLD.position,'active',OLD.is_active),jsonb_build_object('role',NEW.position,'active',NEW.is_active));
 END IF; RETURN NEW;
END; $$;
CREATE TRIGGER audit_employee_access AFTER UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.audit_employee_access();
REVOKE ALL ON FUNCTION public.get_employee_permissions(uuid,public.employee_position),public.set_employee_permission_override(uuid,uuid,text,text,text),public.lock_employee_access_changes(),public.protect_last_active_owner(),public.audit_employee_access() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_employee_permissions(uuid,public.employee_position),public.set_employee_permission_override(uuid,uuid,text,text,text) TO service_role;
COMMIT;
