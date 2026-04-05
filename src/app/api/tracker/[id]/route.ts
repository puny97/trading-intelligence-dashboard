import { NextResponse } from 'next/server'
import { turso, ensureDB } from '@/lib/turso'

/** DELETE /api/tracker/:id → remove a tracked deal */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await ensureDB()
  try {
    await turso.execute({
      sql: 'DELETE FROM tracked_deals WHERE id = ?',
      args: [params.id],
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
