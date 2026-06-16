-- Пол (gender) больше не запрашивается при регистрации: пользователь заполняет
-- его по желанию в личном кабинете уже после создания аккаунта. Поле gender на
-- временной заявке EmailVerificationChallenge стало мёртвым — удаляем его.
-- User.gender сохраняется (заполняется в кабинете через /api/account/profile).
ALTER TABLE "EmailVerificationChallenge" DROP COLUMN "gender";
