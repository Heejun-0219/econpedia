-- Econ-Sync: Phase 1 & 3 Supabase Database Schema
-- 날짜: 2026-05-04

-- 1. 데일리 브리핑 투표 테이블 (Polls)
-- (옵션 텍스트 등의 메타데이터를 저장)
CREATE TABLE IF NOT EXISTS public.polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id TEXT UNIQUE NOT NULL, -- ex) "daily-2026-04-09"
    question TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 투표 결과 테이블 (Poll Votes)
-- (유저 1명당 1표 제한, 지갑 연동 여부 스냅샷 저장)
CREATE TABLE IF NOT EXISTS public.poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id TEXT REFERENCES public.polls(poll_id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    option_selected TEXT NOT NULL CHECK (option_selected IN ('A', 'B')),
    is_shareholder BOOLEAN DEFAULT FALSE, -- 투표 시점에 관련 자산이 1원 이상인지 여부
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(poll_id, user_id) -- 한 투표에 유저당 1회만 참여 가능
);

-- 3. 고래 타임어택 라운지 코멘트 테이블 (Time Attack Comments)
-- (유저의 포지션과 의견을 저장)
CREATE TABLE IF NOT EXISTS public.time_attack_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id TEXT NOT NULL, -- ex) "whale-amzn-2026-04-21"
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    position TEXT NOT NULL CHECK (position IN ('follow', 'hold', 'opposite')),
    content TEXT NOT NULL,
    is_shareholder BOOLEAN DEFAULT FALSE, -- 코멘트 작성 시점에 해당 주식을 보유 중인지 여부
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 유저 프로필 확장 뷰 (User Profiles View)
-- (auth.users 의 메타데이터를 편하게 가져오기 위한 뷰)
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT 
    id AS user_id,
    raw_user_meta_data->>'full_name' AS full_name,
    raw_user_meta_data->>'avatar_url' AS avatar_url
FROM auth.users;

-- ==========================================
-- 보안 (Row Level Security - RLS) 정책 설정
-- ==========================================

-- Polls 테이블: 누구나 읽기 가능, 삽입/수정은 서버(스크립트)에서만 가능해야 하지만 편의상 일단 읽기만 오픈
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Polls are viewable by everyone" ON public.polls FOR SELECT USING (true);

-- Poll Votes 테이블: 누구나 집계 읽기 가능, 본인 계정으로만 투표 가능
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Votes are viewable by everyone" ON public.poll_votes FOR SELECT USING (true);
CREATE POLICY "Users can insert their own votes" ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own votes" ON public.poll_votes FOR UPDATE USING (auth.uid() = user_id);

-- Time Attack Comments 테이블: 누구나 읽기 가능, 본인 계정으로만 작성 가능
ALTER TABLE public.time_attack_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments are viewable by everyone" ON public.time_attack_comments FOR SELECT USING (true);
CREATE POLICY "Users can insert their own comments" ON public.time_attack_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own comments" ON public.time_attack_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own comments" ON public.time_attack_comments FOR DELETE USING (auth.uid() = user_id);
