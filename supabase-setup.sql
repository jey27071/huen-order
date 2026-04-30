-- ✅ Supabase SQL Editor에 이 내용을 붙여넣고 Run 버튼을 누르세요

-- 주문 테이블 생성
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_no TEXT NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '준비중',
  items_name TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 실시간 기능 활성화 (관리자 ↔ 사용자 앱 실시간 연동)
ALTER TABLE orders REPLICA IDENTITY FULL;

-- 누구나 읽고 쓸 수 있도록 허용 (나중에 로그인 추가 시 변경 가능)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "누구나 주문 조회 가능" ON orders FOR SELECT USING (true);
CREATE POLICY "누구나 주문 가능" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "누구나 상태 변경 가능" ON orders FOR UPDATE USING (true);
