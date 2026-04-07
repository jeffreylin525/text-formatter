import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 });
  }

  const { id } = await params;
  const sql = getDb();
  const rows = await sql`
    SELECT id, title, content, updated_at
    FROM documents
    WHERE id = ${Number(id)} AND user_id = ${user.id}
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: '文件不存在' }, { status: 404 });
  }

  return NextResponse.json({ document: rows[0] });
}
