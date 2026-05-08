-- Econ-Sync: Final Security & Integrity Patch
-- 날짜: 2026-05-04

-- 1. [Critical] user_settings 테이블 개인정보 유출 방어 (RLS 적용)
-- 기존에 누락되었던 RLS를 적용하여 남의 지갑(자산) 금액을 훔쳐보거나 위변조할 수 없게 막습니다.
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
CREATE POLICY "Users can view own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
CREATE POLICY "Users can insert own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
CREATE POLICY "Users can update own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

-- 2. [Critical] Client-Side Trust 취약점 방어 (is_shareholder 위변조 불가)
-- 프론트엔드에서 날아온 is_shareholder 불리언 값을 무시하고, 
-- 데이터베이스가 직접 user_settings를 조회하여 주주 뱃지 자격을 100% 검증하도록 트리거를 생성합니다.

CREATE OR REPLACE FUNCTION verify_shareholder_status()
RETURNS TRIGGER AS $$
DECLARE
    wallet_exists BOOLEAN;
BEGIN
    -- 유저의 실제 지갑 연동(투자금 1원 이상) 여부를 DB 레벨에서 확인
    SELECT EXISTS (
        SELECT 1 FROM public.user_settings 
        WHERE user_id = NEW.user_id 
        AND (investment > 0 OR us_stock > 0 OR crypto > 0)
    ) INTO wallet_exists;

    -- 클라이언트가 보낸 값과 무관하게 DB 검증 결과로 강제 덮어쓰기
    NEW.is_shareholder := COALESCE(wallet_exists, FALSE);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 투표(Poll Votes) 검증 트리거
DROP TRIGGER IF EXISTS enforce_real_shareholder_poll ON public.poll_votes;
CREATE TRIGGER enforce_real_shareholder_poll
BEFORE INSERT OR UPDATE ON public.poll_votes
FOR EACH ROW
EXECUTE FUNCTION verify_shareholder_status();

-- 코멘트(Time Attack) 검증 트리거
DROP TRIGGER IF EXISTS enforce_real_shareholder_comment ON public.time_attack_comments;
CREATE TRIGGER enforce_real_shareholder_comment
BEFORE INSERT OR UPDATE ON public.time_attack_comments
FOR EACH ROW
EXECUTE FUNCTION verify_shareholder_status();
