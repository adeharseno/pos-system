BEGIN;

-- Expose and manage employees.username from the employee admin RPCs.
-- Username stays optional at the API boundary (legacy callers keep working via
-- the column default), but the employee UI now always sends it.

CREATE OR REPLACE FUNCTION public.employee_admin_read(p_actor uuid,p_employee uuid DEFAULT NULL,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.require_employee_admin(p_actor);
  IF p_limit<1 OR p_limit>100 OR p_offset<0 THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(row_data),'[]') FROM (
    SELECT jsonb_build_object('id',e.id,'full_name',e.full_name,'username',e.username,'position',e.position,'phone',e.phone,
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

CREATE OR REPLACE FUNCTION public.employee_admin_write(p_actor uuid,p_operation text,p_employee uuid,p_values jsonb,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor uuid; v_id uuid; v_before jsonb; v_after jsonb; v_role public.employee_position; v_username text;
BEGIN
  v_actor:=public.require_employee_admin(p_actor);
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  PERFORM set_config('pos.actor',v_actor::text,true);
  PERFORM set_config('pos.reason',btrim(p_reason),true);
  IF p_values ? 'username' THEN
    v_username:=lower(btrim(coalesce(p_values->>'username','')));
    IF v_username !~ '^[a-z0-9._-]{3,30}$' THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
  END IF;
  IF p_operation='create' THEN
    IF p_values->>'full_name' IS NULL OR length(btrim(p_values->>'full_name')) NOT BETWEEN 1 AND 150
      OR p_values->>'request_id' IS NULL THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
    v_role:=coalesce(p_values->>'position','staf')::public.employee_position;
    SELECT id INTO v_id FROM public.employees WHERE creation_request_id=(p_values->>'request_id')::uuid;
    IF v_id IS NOT NULL THEN
      IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=v_id AND full_name=btrim(p_values->>'full_name')
        AND position=v_role AND phone IS NOT DISTINCT FROM nullif(p_values->>'phone','')
        AND (NOT p_values ? 'join_date' OR join_date=(p_values->>'join_date')::date)
        AND (v_username IS NULL OR username=v_username)) THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
      RETURN v_id;
    END IF;
    IF v_username IS NOT NULL AND EXISTS(SELECT 1 FROM public.employees WHERE lower(username)=v_username) THEN
      RAISE EXCEPTION 'DUPLICATE_USERNAME';
    END IF;
    INSERT INTO public.employees(full_name,position,phone,join_date,creation_request_id,username)
      VALUES(btrim(p_values->>'full_name'),v_role,nullif(p_values->>'phone',''),
        coalesce((p_values->>'join_date')::date,(clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date),
        (p_values->>'request_id')::uuid,
        coalesce(v_username,'user_'||lpad(nextval('public.employee_username_seq')::text,3,'0')))
      RETURNING id INTO v_id;
  ELSE
    v_id:=p_employee;
    SELECT jsonb_build_object('full_name',full_name,'username',username,'phone',phone,'join_date',join_date,'role',position,'active',is_active)
      INTO v_before FROM public.employees WHERE id=v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND'; END IF;
    IF p_operation='edit' THEN
      IF p_values ? 'full_name' AND length(btrim(coalesce(p_values->>'full_name',''))) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_INPUT'; END IF;
      IF v_username IS NOT NULL AND EXISTS(SELECT 1 FROM public.employees WHERE lower(username)=v_username AND id<>v_id) THEN
        RAISE EXCEPTION 'DUPLICATE_USERNAME';
      END IF;
      UPDATE public.employees SET full_name=CASE WHEN p_values ? 'full_name' THEN btrim(p_values->>'full_name') ELSE full_name END,
        username=CASE WHEN v_username IS NOT NULL THEN v_username ELSE username END,
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
  SELECT jsonb_build_object('full_name',full_name,'username',username,'phone',phone,'join_date',join_date,'role',position,'active',is_active)
    INTO v_after FROM public.employees WHERE id=v_id;
  IF v_before IS DISTINCT FROM v_after AND p_operation NOT IN ('access','role') THEN
    INSERT INTO public.security_audit_events(actor_employee_id,action,target_id,before_value,after_value,reason)
      VALUES(v_actor,'employee.'||p_operation,v_id::text,v_before,v_after,btrim(p_reason));
  END IF;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.employee_admin_read(uuid,uuid,integer,integer),
  public.employee_admin_write(uuid,text,uuid,jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.employee_admin_read(uuid,uuid,integer,integer),
  public.employee_admin_write(uuid,text,uuid,jsonb,text)
  TO service_role;

COMMIT;
