import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb, initDb } from '@/lib/db';

// GET /api/documents — list user's documents
export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 });
  }

  const sql = getDb();
  const docs = await sql`
    SELECT id, title, updated_at, created_at
    FROM documents
    WHERE user_id = ${user.id}
    ORDER BY updated_at DESC
  `;
  return NextResponse.json({ documents: docs });
}

// POST /api/documents — create or update a document
export async function POST(req: Request) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 });
  }

  const { id, title, content } = await req.json();
  const sql = getDb();
  await initDb();

  if (id) {
    // Update existing document (verify ownership)
    const existing = await sql`
      SELECT id FROM documents WHERE id = ${id} AND user_id = ${user.id}
    `;
    if (existing.length === 0) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    await sql`
      UPDATE documents
      SET title = ${title || '未命名文件'}, content = ${JSON.stringify(content)}, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.id}
    `;
    return NextResponse.json({ id, saved: true });
  } else {
    // Create new document
    const result = await sql`
      INSERT INTO documents (user_id, title, content)
      VALUES (${user.id}, ${title || '未命名文件'}, ${JSON.stringify(content)})
      RETURNING id
    `;
    return NextResponse.json({ id: result[0].id, saved: true });
  }
}

// DELETE /api/documents?id=xxx — delete a document
export async function DELETE(req: Request) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: '缺少文件 ID' }, { status: 400 });
  }

  const sql = getDb();
  await sql`DELETE FROM documents WHERE id = ${Number(id)} AND user_id = ${user.id}`;
  return NextResponse.json({ deleted: true });
}
