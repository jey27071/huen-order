-- ✅ Supabase SQL Editor에 전체 붙여넣고 Run 하세요

-- 1. 스탬프 테이블
CREATE TABLE IF NOT EXISTS stamps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 쿠폰 테이블
CREATE TABLE IF NOT EXISTS coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'americano',
  is_used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ
);

-- 3. 고객 문의 테이블
CREATE TABLE IF NOT EXISTS inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_name TEXT NOT NULL DEFAULT '익명',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_answered BOOLEAN NOT NULL DEFAULT false,
  answer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  answered_at TIMESTAMPTZ
);

-- 4. 배너 테이블
CREATE TABLE IF NOT EXISTS banners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 공지사항 테이블
CREATE TABLE IF NOT EXISTS notices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 메뉴 아이템 테이블 (하드코딩 → DB)
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'coffee',
  is_available BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 앱 설정 테이블 (주문 중단 등)
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  order_paused BOOLEAN NOT NULL DEFAULT false,
  order_paused_message TEXT NOT NULL DEFAULT '주문이 폭주하여 잠시 중단되었습니다. 잠시 후 다시 이용해주세요.',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 설정 값 삽입
INSERT INTO app_settings (id, order_paused) VALUES ('global', false)
ON CONFLICT (id) DO NOTHING;

-- 기본 배너 삽입
INSERT INTO banners (image_url, title, subtitle, sort_order) VALUES
('https://lh3.googleusercontent.com/aida-public/AB6AXuDFUhnQfcHN6FwvpXlf_v9l5QLQTK5S4QI1JS8vkRA3ZC1tadl2TPXzstqJq_vpkAamUZqe991VfR2SNksbTXijo-7Gf4OiCa2uVWTAJ18wXCE2gqg3JURQ0lFhqwsUjBrJe0L3ObypEUmaeNFPgUTQkDXN76GyCAOnRhf2i3oLh2dOosfDfKz6BzTuyB9U91qRAEa6xY4qCoHOC8s9GnNTyB18DDK9SaKi6gqq54wNu7auPJr7X8OZhF7P974H1mPPcTgIUehAQ2s', 'Quiet Mornings, Crafted Coffee', 'Artisanal & Organic', 0)
ON CONFLICT DO NOTHING;

-- 기본 메뉴 삽입
INSERT INTO menu_items (name, price, tag, image_url, description, category, sort_order) VALUES
('허니 버터 라떼', 6500, '아르티장', 'https://lh3.googleusercontent.com/aida-public/AB6AXuBtCiGPo8kYCPRN1T2x2xOEaNV5wIwJg_KDADVafSbLRnlpgW7HQYPA3rG7YfkjvGklxUYFPG2_ZcS42V7IwNoMUgKdTwG2ABIuJYdQK06_vbFJtZ0-S6mAI0sCY55K2qPJ2De1TkjGBQU-2lp7WfFU0X-smooZD4ZeGQAi7UCuI0dCv6dmOCWmzoG0LjnF3WJphgfSJVLhfaLF0Okq27AApcZpTtBJHzAwi5dL8KYuh396KmrgboJoQ99nVeRn7GDVuL7r4-7_s1g', '부드러운 에스프레소와 직접 만든 허니 버터의 조화', 'coffee', 1),
('포레스트 말차', 7500, '시즌 메뉴', 'https://lh3.googleusercontent.com/aida-public/AB6AXuDVqv3jtL-mY5Hv3y3ptDcHXvK0WLWpRpnUKRKXILEhlN90OmXR4dhMWCQvIaCYwBcOcwg1UbUMqZgoSTWZOwu0Z0I3KAPIrZ0jeT7eBIAH4Sbm-AvBIWcZVPQG4Qt_dJskg6rPReJnS4WGjpW72GwKBlbWPfKMtKHNC2m66xKi5NTSJK_U-AJS_C7CRjhRQaCDa-avZd8e-zt0Rqcuc35KNJim6dk82w8aGI_RPByz2zSsh0srugsXvvNdC3Qxk14KARFS_mcP9PE', '제주도산 최고급 말차로 만든 깊은 풍미', 'tea', 2),
('미드나잇 콜드브루', 5500, '오리진', 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?q=80&w=800', '24시간 동안 정성껏 우려낸 싱글 오리진 커피', 'coffee', 3),
('크리미 아인슈페너', 7500, '클래식', 'https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=800', '진하고 깊은 아메리카노 위에 올린 수제 휘핑크림', 'coffee', 4),
('아메리카노', 4000, '기본', 'https://images.unsplash.com/photo-1550246140-5119ae4790b8?q=80&w=800', '깔끔하고 진한 에스프레소 아메리카노', 'coffee', 5),
('오리지널 팥빙수', 12000, '여름 시즌', 'https://images.unsplash.com/photo-1553177595-4de2bb0842b9?q=80&w=800', '부드러운 우유 얼음과 달콤한 통팥의 완벽한 조화', 'food', 6),
('피치 얼그레이 티', 6000, '베스트', 'https://images.unsplash.com/photo-1576092762791-dd9e2220afa1?q=80&w=800', '은은한 얼그레이에 달콤한 복숭아 과육이 씹히는 아이스티', 'tea', 7),
('캐모마일 릴렉서', 5500, '카페인 프리', 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?q=80&w=800', '마음을 편안하게 해주는 향긋한 허브티', 'tea', 8),
('레몬 민트 티', 5500, '오가닉', 'https://images.unsplash.com/photo-1517487881594-2787fef5ebf7?q=80&w=800', '상쾌한 민트와 레몬의 새콤달콤한 조화', 'tea', 9),
('디카페인 아메리카노', 4500, '디카페인', 'https://images.unsplash.com/photo-1550246140-5119ae4790b8?q=80&w=800', '카페인 부담 없이 즐기는 깔끔한 아메리카노', 'decaf', 10),
('디카페인 바닐라 빈 라떼', 6000, '달콤한', 'https://images.unsplash.com/photo-1579888944510-9ec87b4fbc60?q=80&w=800', '리얼 바닐라 빈의 진한 풍미가 느껴지는 라떼', 'decaf', 11),
('디카페인 오트 콜드브루', 6500, '비건', 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?q=80&w=800', '고소한 귀리 우유와 부드러운 콜드브루의 만남', 'decaf', 12),
('클래식 크루아상', 3500, '추천', 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?q=80&w=800', 'AOP 버터를 듬뿍 넣어 구워낸 결이 살아있는 크루아상', 'food', 13),
('바스크 치즈 케이크', 7000, '시그니처', 'https://images.unsplash.com/photo-1595908129746-5741f021e1e9?q=80&w=800', '고온에서 구워내 겉은 스모키하고 속은 촉촉한 크림치즈 케이크', 'food', 14),
('트러플 머쉬룸 파니니', 8500, '든든한 한끼', 'https://images.unsplash.com/photo-1553909489-cd47ce7f09a4?q=80&w=800', '트러플 오일의 풍미와 버섯, 베이컨이 듬뿍 들어간 파니니', 'food', 15)
ON CONFLICT DO NOTHING;

-- Realtime 활성화
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE orders, app_settings, banners, notices, menu_items, stamps, coupons, inquiries;
