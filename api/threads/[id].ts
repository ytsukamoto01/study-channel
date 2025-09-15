// /api/threads/[id].ts (Next.js Edge/NodeどちらでもOK)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY! // サーバ専用

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  const payload = await req.json() as {
    user_fingerprint: string
    title?: string; content?: string; category?: string; subcategory?: string | null
    hashtags?: string[]; images?: string[]
  }
  if (!payload?.user_fingerprint) {
    return NextResponse.json({ error: 'user_fingerprint required' }, { status: 400 })
  }

  // 1) 所有者検証（anonでSELECT）
  const anon = createClient(supabaseUrl, anonKey)
  const { data: rows, error: selErr } = await anon
    .from('threads')
    .select('id,user_fingerprint')
    .eq('id', id)
    .limit(1)
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })
  if (!rows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (rows[0].user_fingerprint !== payload.user_fingerprint) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2) 所有者OK → service_roleでUPDATE（RLS無視）
  const svc = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await svc
    .from('threads')
    .update({
      title: payload.title,
      content: payload.content,
      category: payload.category,
      subcategory: payload.subcategory ?? null,
      hashtags: payload.hashtags ?? null,
      images: payload.images ?? null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  const payload = await req.json().catch(() => ({})) as { user_fingerprint?: string }
  if (!payload?.user_fingerprint) {
    return NextResponse.json({ error: 'user_fingerprint required' }, { status: 400 })
  }

  // 所有者検証
  const anon = createClient(supabaseUrl, anonKey)
  const { data: rows, error: selErr } = await anon
    .from('threads')
    .select('id,user_fingerprint')
    .eq('id', id)
    .limit(1)
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })
  if (!rows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (rows[0].user_fingerprint !== payload.user_fingerprint) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // service_roleでDELETE
  const svc = createClient(supabaseUrl, serviceRoleKey)
  const { error } = await svc.from('threads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
