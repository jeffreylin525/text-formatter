import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb, initDb } from '@/lib/db';
import { createToken, sessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: '請輸入信箱和密碼' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: '密碼至少 6 個字元' }, { status: 400 });
    }

    const sql = getDb();
    await initDb();

    // Check if user exists
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: '此信箱已註冊' }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await sql`
      INSERT INTO users (email, password_hash) VALUES (${email}, ${hash})
      RETURNING id, email
    `;
    const user = result[0];

    const token = await createToken({ id: user.id, email: user.email });
    const cookie = sessionCookie(token);

    const res = NextResponse.json({ user: { id: user.id, email: user.email } });
    res.cookies.set(cookie);
    return res;
  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json({ error: '註冊失敗，請稍後重試' }, { status: 500 });
  }
}
