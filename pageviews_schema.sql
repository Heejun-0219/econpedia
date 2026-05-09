-- Econ-Sync: Pageviews Tracking Schema
-- 날짜: 2026-05-04

-- 1. 조회수(Pageviews) 테이블 생성
CREATE TABLE IF NOT EXISTS public.pageviews (
    slug TEXT PRIMARY KEY,
    view_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 보안(RLS) 정책 설정
-- 누구나 조회 가능
ALTER TABLE public.pageviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pageviews are viewable by everyone" ON public.pageviews;
CREATE POLICY "Pageviews are viewable by everyone" ON public.pageviews FOR SELECT USING (true);

-- 3. 안전하게 조회수를 증가시키는 함수 (RPC)
-- 프론트엔드에서 임의의 값을 UPDATE하지 못하도록 캡슐화합니다.
CREATE OR REPLACE FUNCTION increment_pageview(article_slug TEXT)
RETURNS void AS $$
BEGIN
    INSERT INTO public.pageviews (slug, view_count)
    VALUES (article_slug, 1)
    ON CONFLICT (slug) DO UPDATE
    SET view_count = public.pageviews.view_count + 1,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
