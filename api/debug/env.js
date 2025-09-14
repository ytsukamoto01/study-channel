export default async function handler(req, res) {
  const ok1 = !!process.env.SUPABASE_URL;
  const ok2 = !!process.env.SUPABASE_ANON_KEY;
  console.log('ENV CHECK', { ok1, ok2 });
  return res.status(200).json({ urlOk: ok1, keyOk: ok2 });
}
