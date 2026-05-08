REVOKE ALL ON FUNCTION public.user_has_expense_split(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_expense_split(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_has_expense_split(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_access_expense_record(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_expense_record(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_expense_record(uuid, uuid) TO authenticated;