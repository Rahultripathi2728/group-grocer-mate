-- Allow authenticated users to find groups by invite_code (needed for joining)
CREATE POLICY "Users can find groups by invite code"
ON public.groups
FOR SELECT
TO authenticated
USING (invite_code IS NOT NULL);