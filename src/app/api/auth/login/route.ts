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

    const sql = getDb();
    await initDb();

    const rows = await sql`SELECT id, email, password_hash FROM users WHERE email = ${email}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: '信箱或密碼錯誤' }, { status: 401 });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: '信箱或密碼錯誤' }, { status: 401 });
    }

    const token = await createToken({ id: user.id, email: user.email });
    const cookie = sessionCookie(token);

    const res = NextResponse.json({ user: { id: user.id, email: user.email } });
    res.cookies.set(cookie);
    return res;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: '登入失敗，請稍後重試' }, { status: 500 });
  }
}
