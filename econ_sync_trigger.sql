CREATE OR REPLACE FUNCTION check_comment_cooldown()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM time_attack_comments
        WHERE user_id = NEW.user_id
        AND created_at > NOW() - INTERVAL '30 seconds'
    ) THEN
        RAISE EXCEPTION 'You must wait 30 seconds before posting another comment.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_comment_cooldown ON time_attack_comments;
CREATE TRIGGER enforce_comment_cooldown
BEFORE INSERT ON time_attack_comments
FOR EACH ROW
EXECUTE FUNCTION check_comment_cooldown();
