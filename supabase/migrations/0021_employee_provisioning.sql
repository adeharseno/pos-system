BEGIN;

ALTER TABLE public.employees ADD COLUMN creation_request_id uuid UNIQUE;
CREATE TABLE public.employee_invitations (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE RESTRICT,
  email text NOT NULL UNIQUE CHECK (email=lower(btrim(email))),
  auth_user_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'retryable' CHECK(status IN ('invited','active','failed','retryable')),
  attempt_id uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  failure_code text CHECK(failure_code IN ('EMAIL_CONFLICT','DELIVERY_FAILED','PROVISIONING_FAILED')),
  invited_at timestamptz,
  accepted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_invitations FROM PUBLIC,anon,authenticated,service_role;

-- All administrative commands lock the same row BEFORE inspecting actors or targets.
CREATE FUNCTION public.require_employee_admin(p_actor uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.employee_access_guard SET revision=revision+1 WHERE id=true;
  SELECT e.id INTO v_id FROM public.employees e JOIN public.user_profiles u ON u.employee_id=e.id
    JOIN auth.users a ON a.id=u.id
    LEFT JOIN public.employee_invitations i ON i.employee_id=e.id
    WHERE u.id=p_actor AND e.is_active AND e.position='owner_admin'
      AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp())
      AND (i.employee_id IS NULL OR i.status='active');
  IF v_id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN v_id;
END; $$;

CREATE FUNCTION public.other_usable_owner(p_excluded uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM public.employees e JOIN public.user_profiles p ON p.employee_id=e.id
    JOIN auth.users a ON a.id=p.id LEFT JOIN public.employee_invitations i ON i.employee_id=e.id
    WHERE e.id<>p_excluded AND e.position='owner_admin' AND e.is_active
      AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp())
      AND (i.employee_id IS NULL OR i.status='active'));
$$;

CREATE OR REPLACE FUNCTION public.protect_last_active_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.position='owner_admin' AND OLD.is_active AND
    (TG_OP='DELETE' OR NEW.position<>'owner_admin' OR NOT NEW.is_active) AND
    NOT public.other_usable_owner(OLD.id) THEN RAISE EXCEPTION 'LAST_ACTIVE_OWNER'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.protect_owner_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_employee uuid; v_removing boolean;
BEGIN
  IF TG_TABLE_SCHEMA='auth' THEN
    SELECT employee_id INTO v_employee FROM public.user_profiles WHERE id=OLD.id;
    v_removing := TG_OP='DELETE';
    IF TG_OP='UPDATE' THEN v_removing:=NEW.banned_until>clock_timestamp(); END IF;
  ELSE
    v_employee:=OLD.employee_id;
    v_removing:=TG_OP='DELETE';
    IF TG_OP='UPDATE' THEN v_removing:=NEW.employee_id IS DISTINCT FROM OLD.employee_id OR NEW.id IS DISTINCT FROM OLD.id; END IF;
  END IF;
  IF v_removing AND EXISTS(SELECT 1 FROM public.employees WHERE id=v_employee AND position='owner_admin' AND is_active)
    AND NOT public.other_usable_owner(v_employee) THEN RAISE EXCEPTION 'LAST_ACTIVE_OWNER'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER serialize_profile_access BEFORE UPDATE OR DELETE ON public.user_profiles
  FOR EACH STATEMENT EXECUTE FUNCTION public.lock_employee_access_changes();
CREATE TRIGGER protect_owner_profile BEFORE UPDATE OR DELETE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_account();
CREATE TRIGGER serialize_auth_access BEFORE UPDATE OF banned_until OR DELETE ON auth.users
  FOR EACH STATEMENT EXECUTE FUNCTION public.lock_employee_access_changes();
CREATE TRIGGER protect_owner_auth BEFORE UPDATE OF banned_until OR DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_account();

CREATE OR REPLACE FUNCTION public.audit_employee_access() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.position IS DISTINCT FROM NEW.position OR OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    INSERT INTO public.security_audit_events(actor_employee_id,action,target_id,before_value,after_value,reason)
    VALUES(nullif(current_setting('pos.actor',true),'')::uuid,'employee.access',NEW.id::text,
      jsonb_build_object('role',OLD.position,'active',OLD.is_active),
      jsonb_build_object('role',NEW.position,'active',NEW.is_active),nullif(current_setting('pos.reason',true),''));
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.employee_admin_read(p_actor uuid,p_employee uuid DEFAULT NULL,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.require_employee_admin(p_actor);
  IF p_limit<1 OR p_limit>100 OR p_offset<0 THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(row_data),'[]') FROM (
    SELECT jsonb_build_object('id',e.id,'full_name',e.full_name,'position',e.position,'phone',e.phone,
      'join_date',e.join_date,'is_active',e.is_active,'email',coalesce(a.email,i.email),
      'account_status',CASE WHEN NOT e.is_active THEN 'disabled'
        WHEN a.banned_until>clock_timestamp() THEN 'disabled'
        WHEN i.employee_id IS NOT NULL THEN i.status WHEN a.id IS NOT NULL THEN 'active' ELSE 'not_invited' END,
      'retryable',i.status='retryable' AND coalesce(i.lease_until<clock_timestamp(),true),
      'failure_code',i.failure_code) AS row_data
    FROM public.employees e LEFT JOIN public.user_profiles p ON p.employee_id=e.id
      LEFT JOIN auth.users a ON a.id=p.id LEFT JOIN public.employee_invitations i ON i.employee_id=e.id
    WHERE p_employee IS NULL OR e.id=p_employee ORDER BY e.full_name,e.id LIMIT p_limit OFFSET p_offset
  ) rows);
END; $$;

CREATE FUNCTION public.employee_admin_write(p_actor uuid,p_operation text,p_employee uuid,p_values jsonb,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor uuid; v_id uuid; v_before jsonb; v_after jsonb; v_role public.employee_position;
BEGIN
  v_actor:=public.require_employee_admin(p_actor);
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  PERFORM set_config('pos.actor',v_actor::text,true);
  PERFORM set_config('pos.reason',btrim(p_reason),true);
  IF p_operation='create' THEN
    IF p_values->>'full_name' IS NULL OR length(btrim(p_values->>'full_name')) NOT BETWEEN 1 AND 150
      OR p_values->>'request_id' IS NULL THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
    v_role:=coalesce(p_values->>'position','staf')::public.employee_position;
    SELECT id INTO v_id FROM public.employees WHERE creation_request_id=(p_values->>'request_id')::uuid;
    IF v_id IS NOT NULL THEN
      IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=v_id AND full_name=btrim(p_values->>'full_name')
        AND position=v_role AND phone IS NOT DISTINCT FROM nullif(p_values->>'phone','')
        AND (NOT p_values ? 'join_date' OR join_date=(p_values->>'join_date')::date)) THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
      RETURN v_id;
    END IF;
    INSERT INTO public.employees(full_name,position,phone,join_date,creation_request_id)
      VALUES(btrim(p_values->>'full_name'),v_role,nullif(p_values->>'phone',''),
        coalesce((p_values->>'join_date')::date,(clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date),
        (p_values->>'request_id')::uuid) RETURNING id INTO v_id;
  ELSE
    v_id:=p_employee;
    SELECT jsonb_build_object('full_name',full_name,'phone',phone,'join_date',join_date,'role',position,'active',is_active)
      INTO v_before FROM public.employees WHERE id=v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
    IF p_operation='edit' THEN
      IF p_values ? 'full_name' AND length(btrim(coalesce(p_values->>'full_name',''))) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
      UPDATE public.employees SET full_name=CASE WHEN p_values ? 'full_name' THEN btrim(p_values->>'full_name') ELSE full_name END,
        phone=CASE WHEN p_values ? 'phone' THEN nullif(p_values->>'phone','') ELSE phone END,
        join_date=CASE WHEN p_values ? 'join_date' THEN (p_values->>'join_date')::date ELSE join_date END WHERE id=v_id;
    ELSIF p_operation='access' THEN
      IF jsonb_typeof(p_values->'is_active')<>'boolean' OR NOT p_values ? 'is_active' THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
      UPDATE public.employees SET is_active=(p_values->>'is_active')::boolean WHERE id=v_id;
    ELSIF p_operation='role' THEN
      IF p_values->>'position' IS NULL THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
      UPDATE public.employees SET position=(p_values->>'position')::public.employee_position WHERE id=v_id;
    ELSE RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
  END IF;
  SELECT jsonb_build_object('full_name',full_name,'phone',phone,'join_date',join_date,'role',position,'active',is_active)
    INTO v_after FROM public.employees WHERE id=v_id;
  IF v_before IS DISTINCT FROM v_after AND p_operation NOT IN ('access','role') THEN
    INSERT INTO public.security_audit_events(actor_employee_id,action,target_id,before_value,after_value,reason)
      VALUES(v_actor,'employee.'||p_operation,v_id::text,v_before,v_after,btrim(p_reason));
  END IF;
  RETURN v_id;
END; $$;

CREATE FUNCTION public.employee_permission_read(p_actor uuid,p_employee uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_role public.employee_position; v_active boolean;
BEGIN
  PERFORM public.require_employee_admin(p_actor);
  SELECT position,is_active INTO v_role,v_active FROM public.employees WHERE id=p_employee;
  IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('role',v_role,'is_active',v_active,
    'account_enabled',public.employee_account_access((SELECT id FROM public.user_profiles WHERE employee_id=p_employee)),
    'definitions',(SELECT coalesce(jsonb_agg(code),'[]') FROM public.permission_definitions),
    'preset',(SELECT coalesce(jsonb_agg(permission_code),'[]') FROM public.role_permissions WHERE role=v_role),
    'overrides',(SELECT coalesce(jsonb_agg(jsonb_build_object('permission',permission_code,'effect',effect)),'[]')
      FROM public.employee_permission_overrides WHERE employee_id=p_employee));
END; $$;

-- Tighten the existing entry point too: callers cannot bypass protection via the older RPC.
CREATE OR REPLACE FUNCTION public.set_employee_permission_override(p_actor_auth_user_id uuid,p_employee_id uuid,p_permission_code text,p_effect text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor uuid; v_before jsonb; v_after jsonb;
BEGIN
  v_actor:=public.require_employee_admin(p_actor_auth_user_id);
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.permission_definitions WHERE code=p_permission_code) THEN RAISE EXCEPTION 'UNKNOWN_PERMISSION'; END IF;
  IF p_permission_code LIKE 'employees.%' OR p_permission_code IN ('permissions.manage','audit.view','products.activate','products.create')
    OR p_permission_code LIKE 'submissions.%' AND p_permission_code NOT IN ('submissions.view_own','submissions.create','submissions.edit_own','submissions.submit')
    THEN RAISE EXCEPTION 'PROTECTED_PERMISSION'; END IF;
  IF p_effect IS NOT NULL AND p_effect NOT IN ('allow','deny') THEN RAISE EXCEPTION 'INVALID_OVERRIDE'; END IF;
  PERFORM 1 FROM public.employees WHERE id=p_employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
  IF v_actor=p_employee_id OR EXISTS(SELECT 1 FROM public.employees WHERE id=p_employee_id AND position='owner_admin') THEN RAISE EXCEPTION 'OWNER_PERMISSIONS_PROTECTED'; END IF;
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

CREATE FUNCTION public.employee_invitation_command(p_actor uuid,p_operation text,p_employee uuid,p_email text DEFAULT NULL,p_attempt uuid DEFAULT NULL,p_failure text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor uuid; v_row public.employee_invitations%rowtype; v_existing uuid; v_email text;
BEGIN
  v_actor:=public.require_employee_admin(p_actor);
  PERFORM 1 FROM public.employees WHERE id=p_employee AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_INACTIVE'; END IF;
  SELECT * INTO v_row FROM public.employee_invitations WHERE employee_id=p_employee FOR UPDATE;
  IF p_operation='claim' THEN
    v_email:=lower(btrim(p_email));
    IF v_email IS NULL OR length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
    IF v_row.employee_id IS NULL THEN
      IF EXISTS(SELECT 1 FROM public.user_profiles WHERE employee_id=p_employee) THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_LINKED'; END IF;
      IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=v_email) THEN RAISE EXCEPTION 'EMAIL_CONFLICT'; END IF;
      INSERT INTO public.employee_invitations(employee_id,email) VALUES(p_employee,v_email) RETURNING * INTO v_row;
    ELSIF v_row.email<>v_email THEN RAISE EXCEPTION 'EMAIL_CONFLICT'; END IF;
    IF v_row.status='active' THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_LINKED'; END IF;
    IF v_row.status='failed' THEN RAISE EXCEPTION 'EMAIL_CONFLICT'; END IF;
    IF v_row.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'INVITATION_BUSY'; END IF;
    SELECT id INTO v_existing FROM auth.users WHERE lower(email)=v_email;
    IF v_existing IS NOT NULL AND v_existing<>v_row.auth_user_id THEN RAISE EXCEPTION 'EMAIL_CONFLICT'; END IF;
    UPDATE public.employee_invitations SET attempt_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes',
      attempts=attempts+1,failure_code=NULL,updated_at=clock_timestamp() WHERE employee_id=p_employee RETURNING * INTO v_row;
  ELSE
    IF v_row.employee_id IS NULL OR v_row.attempt_id IS DISTINCT FROM p_attempt OR v_row.lease_until IS NULL OR v_row.lease_until<=clock_timestamp()
      OR v_row.status='active' THEN RAISE EXCEPTION 'INVITATION_STALE'; END IF;
    IF p_operation='link' THEN
      IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_row.auth_user_id AND lower(email)=v_row.email) THEN RAISE EXCEPTION 'EMAIL_CONFLICT'; END IF;
      IF EXISTS(SELECT 1 FROM public.user_profiles WHERE (id=v_row.auth_user_id AND employee_id IS DISTINCT FROM p_employee)
        OR (employee_id=p_employee AND id<>v_row.auth_user_id)) THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_LINKED'; END IF;
      INSERT INTO public.user_profiles(id,employee_id,display_name)
        SELECT v_row.auth_user_id,id,full_name FROM public.employees WHERE id=p_employee ON CONFLICT(id) DO NOTHING;
    ELSIF p_operation='sent' THEN
      IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=v_row.auth_user_id AND employee_id=p_employee) THEN RAISE EXCEPTION 'INVITATION_STALE'; END IF;
      UPDATE public.employee_invitations SET status='invited',invited_at=clock_timestamp(),lease_until=NULL,
        updated_at=clock_timestamp() WHERE employee_id=p_employee;
    ELSIF p_operation='fail' THEN
      IF p_failure NOT IN ('EMAIL_CONFLICT','DELIVERY_FAILED','PROVISIONING_FAILED') OR p_failure IS NULL THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
      UPDATE public.employee_invitations SET status=CASE WHEN p_failure='EMAIL_CONFLICT' THEN 'failed' ELSE 'retryable' END,
        failure_code=p_failure,lease_until=NULL,updated_at=clock_timestamp() WHERE employee_id=p_employee;
    ELSE RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
  END IF;
  INSERT INTO public.security_audit_events(actor_employee_id,action,target_id,after_value)
    VALUES(v_actor,'invitation.'||p_operation,p_employee::text,jsonb_build_object('failure_code',p_failure));
  SELECT * INTO v_row FROM public.employee_invitations WHERE employee_id=p_employee;
  -- This internal result must never be returned by an HTTP handler.
  RETURN jsonb_build_object('employee_id',v_row.employee_id,'auth_user_id',v_row.auth_user_id,
    'email',v_row.email,'attempt_id',v_row.attempt_id,'status',v_row.status);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'EMAIL_CONFLICT';
END; $$;

-- Called only with the Auth user verified by the server; never with an employee ID from a body.
CREATE FUNCTION public.employee_invitation_accept(p_auth_user uuid,p_complete boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_employee uuid; v_status text;
BEGIN
  UPDATE public.employee_access_guard SET revision=revision+1 WHERE id=true;
  SELECT e.id,i.status INTO v_employee,v_status FROM public.employee_invitations i
    JOIN public.employees e ON e.id=i.employee_id JOIN public.user_profiles p ON p.employee_id=e.id AND p.id=i.auth_user_id
    JOIN auth.users a ON a.id=p.id WHERE a.id=p_auth_user AND e.is_active
      AND lower(a.email)=i.email AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp()) FOR UPDATE OF i;
  IF v_employee IS NULL OR v_status NOT IN ('invited','retryable','active') THEN RAISE EXCEPTION 'INVITATION_STALE'; END IF;
  IF p_complete AND v_status<>'active' THEN
    IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_auth_user AND email_confirmed_at IS NOT NULL
      AND nullif(encrypted_password,'') IS NOT NULL) THEN RAISE EXCEPTION 'INVITATION_STALE'; END IF;
    UPDATE public.employee_invitations SET status='active',accepted_at=clock_timestamp(),lease_until=NULL,
      failure_code=NULL,updated_at=clock_timestamp() WHERE employee_id=v_employee;
    INSERT INTO public.security_audit_events(actor_employee_id,action,target_id)
      VALUES(v_employee,'invitation.accepted',v_employee::text);
  END IF;
END; $$;

CREATE FUNCTION public.employee_account_access(p_auth_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM auth.users a JOIN public.user_profiles p ON p.id=a.id
    JOIN public.employees e ON e.id=p.employee_id LEFT JOIN public.employee_invitations i ON i.employee_id=e.id
    WHERE a.id=p_auth_user AND e.is_active AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp())
      AND (i.employee_id IS NULL OR i.status='active'));
$$;

-- Remove any administrative overrides created before this boundary was protected.
INSERT INTO public.security_audit_events(action,target_id,before_value,reason)
SELECT 'permission.protected_removed',employee_id::text,to_jsonb(o),'Perlindungan izin administratif'
FROM public.employee_permission_overrides o
WHERE permission_code LIKE 'employees.%' OR permission_code IN ('permissions.manage','audit.view','products.activate','products.create')
  OR permission_code LIKE 'submissions.%' AND permission_code NOT IN ('submissions.view_own','submissions.create','submissions.edit_own','submissions.submit');
DELETE FROM public.employee_permission_overrides
WHERE permission_code LIKE 'employees.%' OR permission_code IN ('permissions.manage','audit.view','products.activate','products.create')
  OR permission_code LIKE 'submissions.%' AND permission_code NOT IN ('submissions.view_own','submissions.create','submissions.edit_own','submissions.submit');

REVOKE ALL ON FUNCTION public.require_employee_admin(uuid),public.other_usable_owner(uuid),public.protect_owner_account(),
 public.employee_admin_read(uuid,uuid,integer,integer),public.employee_admin_write(uuid,text,uuid,jsonb,text),
 public.employee_permission_read(uuid,uuid),public.employee_invitation_command(uuid,text,uuid,text,uuid,text),
 public.employee_invitation_accept(uuid,boolean),public.employee_account_access(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.employee_admin_read(uuid,uuid,integer,integer),public.employee_admin_write(uuid,text,uuid,jsonb,text),
 public.employee_permission_read(uuid,uuid),public.employee_invitation_command(uuid,text,uuid,text,uuid,text),
 public.employee_invitation_accept(uuid,boolean),public.employee_account_access(uuid) TO service_role;
COMMIT;
