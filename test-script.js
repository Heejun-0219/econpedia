
      import { supabase } from '../lib/supabase.js';

      document.addEventListener('DOMContentLoaded', async () => {
        const rawDataEl = document.getElementById('market-raw-data');
        if (!rawDataEl) return;
        const raw = JSON.parse(rawDataEl.textContent);
        
        const DEFAULTS = {
          housing: 300000000,
          grocery: 800000,
          gasoline: 50000,
          investment: 10000000,
          us_stock: 5000000,
          crypto: 1000000,
          travel: 1000000
        };

        let settings = { ...DEFAULTS };
        let currentUser = null;

        const loadSettings = async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            currentUser = user;

            if (user) {
              // DB에서 불러오기
              const { data, error } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();
              
              if (data && !error) {
                const dbSettings = { ...data };
                delete dbSettings.id;
                delete dbSettings.user_id;
                delete dbSettings.created_at;
                settings = { ...DEFAULTS, ...dbSettings };
              } else {
                // 첫 로그인 시 localStorage에 있던 데이터 DB로 마이그레이션
                const saved = localStorage.getItem('econpedia_wallet_settings');
                if (saved) {
                  settings = { ...DEFAULTS, ...JSON.parse(saved) };
                  await supabase.from('user_settings').upsert({ user_id: user.id, ...settings });
                }
              }
            } else {
              // 비로그인 상태일 경우 기존처럼 localStorage 사용
              const saved = localStorage.getItem('econpedia_wallet_settings');
              if (saved) settings = { ...DEFAULTS, ...JSON.parse(saved) };
            }
          } catch (err) {
            console.warn('Supabase 연결 실패, 로컬 스토리지로 폴백합니다.', err);
            const saved = localStorage.getItem('econpedia_wallet_settings');
            if (saved) settings = { ...DEFAULTS, ...JSON.parse(saved) };
          }
        };

        await loadSettings();

        // Modals logic
        const modal = document.getElementById('settings-modal');
        const openBtn = document.getElementById('open-wallet-settings');
        const closeBtn = document.getElementById('close-wallet-settings');
        const form = document.getElementById('settings-form');

        if(openBtn) {
          openBtn.addEventListener('click', () => {
            Object.keys(DEFAULTS).forEach(key => {
              const input = document.getElementById('input-' + key);
              if (input) input.value = settings[key];
            });
            modal.style.display = 'flex';
          });
        }

        if(closeBtn) {
          closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
          });
        }

        if(form) {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            Object.keys(DEFAULTS).forEach(key => {
              const input = document.getElementById('input-' + key);
              if (input) {
                settings[key] = input.value === '' ? DEFAULTS[key] : Number(input.value);
              }
            });

            if (currentUser) {
              try {
                // DB에 저장
                await supabase.from('user_settings').upsert({ user_id: currentUser.id, ...settings });
                console.log('✅ 설정이 클라우드에 저장되었습니다.');
              } catch (err) {
                console.error('DB 저장 실패:', err);
                localStorage.setItem('econpedia_wallet_settings', JSON.stringify(settings));
              }
            } else {
              localStorage.setItem('econpedia_wallet_settings', JSON.stringify(settings));
            }
            
            modal.style.display = 'none';
            recalculate();
          });
        }

        const formatChange = (change, upText, downText) => {
          if (change === 0) return '변동 없어요 😌';
          return change > 0 ? upText : downText;
        };

        // Recalculation logic
        const recalculate = () => {
          // 1. Housing (Base Rate)
          if (raw.baseRate) {
            const change = Math.round((settings.housing * (raw.baseRate.change / 100)) / 12);
            updateCard('housing', `내 대출금 기준 이번 달 이자가 약 ${Math.abs(change).toLocaleString()}원 ${formatChange(change, '늘었어요', '줄었어요')}`, change);
          }
          // 2. Grocery (CPI)
          if (raw.cpi) {
            const change = Math.round(settings.grocery * (raw.cpi.changePercent / 100));
            updateCard('grocery', `내 식비 기준 체감 물가가 ${Math.abs(change).toLocaleString()}원 ${formatChange(change, '올랐어요', '내렸어요')}`, change);
          }
          // 3. Gasoline (WTI Oil)
          if (raw.oil) {
            const change = Math.round(settings.gasoline * (raw.oil.changePercent / 100) * 0.5);
            updateCard('gasoline', `1회 주유 시 체감 비용이 약 ${Math.abs(change).toLocaleString()}원 ${formatChange(change, '올랐어요', '내렸어요')}`, change);
          }
          // 4. Investment (KOSPI)
          if (raw.kospi) {
            const change = Math.round(settings.investment * (raw.kospi.changePercent / 100));
            updateCard('investment', `내 투자금 기준 약 ${Math.abs(change).toLocaleString()}원 ${formatChange(change, '올랐어요', '빠졌어요')}`, change);
          }
          // 5. US Stock (S&P500 + KRW)
          if (raw.sp500 && raw.krw) {
            const change = Math.round(settings.us_stock * ((raw.sp500.changePercent + raw.krw.changePercent) / 100));
            updateCard('us_stock', `내 투자금 기준 약 ${Math.abs(change).toLocaleString()}원 ${formatChange(change, '올랐어요', '빠졌어요')}`, change);
          }
          // 6. Travel (KRW)
          if (raw.krw) {
            const change = Math.round(settings.travel * (raw.krw.changePercent / 100));
            updateCard('travel', `내 예산 기준 환전 시 ${Math.abs(change).toLocaleString()}원 더 ${formatChange(change, '비싸졌어요', '아꼈어요')}`, change);
          }
          // 7. Crypto (Bitcoin)
          if (raw.bitcoin) {
            const change = Math.round(settings.crypto * (raw.bitcoin.changePercent / 100));
            updateCard('crypto', `내 투자금 기준 약 ${Math.abs(change).toLocaleString()}원 ${formatChange(change, '올랐어요', '빠졌어요')}`, change);
          }
        };

        const updateCard = (category, newMessage, changeValue) => {
          const cards = document.querySelectorAll('.wallet-card');
          cards.forEach(card => {
            const badgeLabel = card.querySelector('.wallet-card__header span:nth-child(2)');
            if (!badgeLabel) return;
            const text = badgeLabel.textContent.trim();
            const map = {
              'housing': '주거비',
              'grocery': '장바구니',
              'gasoline': '주유비',
              'investment': '국내 주식',
              'us_stock': '미국 주식',
              'crypto': '비트코인',
              'travel': '해외여행',
            };
            
            if (text.includes(map[category])) {
              const valEl = card.querySelector('.wallet-card__value');
              const badgeEl = card.querySelector('.wallet-card__badge');
              
              if (valEl) {
                // Determine sentiment color
                let color = 'var(--color-text-primary)';
                let sentimentText = '평안함';
                
                if (category === 'housing' || category === 'grocery' || category === 'gasoline' || category === 'travel') {
                  if (changeValue > 0) { color = 'var(--color-accent-danger)'; sentimentText = '부정적'; }
                  else if (changeValue < 0) { color = 'var(--color-accent-primary)'; sentimentText = '긍정적'; }
                } else {
                  if (changeValue > 0) { color = 'var(--color-accent-primary)'; sentimentText = '긍정적'; }
                  else if (changeValue < 0) { color = 'var(--color-accent-danger)'; sentimentText = '부정적'; }
                }

                valEl.style.opacity = '0';
                setTimeout(() => {
                  valEl.textContent = newMessage;
                  valEl.style.color = color;
                  if (badgeEl) {
                    badgeEl.textContent = sentimentText;
                    badgeEl.style.color = color;
                    badgeEl.style.borderColor = 'currentColor';
                  }
                  valEl.style.opacity = '1';
                }, 150);
              }
            }
          });
        };

        // 초기 실행
        recalculate();

        // 알림 신청 로직
        const alertForm = document.getElementById('wallet-alert-form');
        if (alertForm) {
          alertForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('wallet-alert-email');
            const email = emailInput.value;
            const submitBtn = alertForm.querySelector('button');
            const originalText = submitBtn.textContent;

            try {
              submitBtn.textContent = '신청 중...';
              submitBtn.disabled = true;

              const res = await fetch('/api/wallet-subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, settings })
              });

              const data = await res.json();
              if (data.success) {
                alert(data.message);
                emailInput.value = '';
              } else {
                alert(data.error || '오류가 발생했습니다.');
              }
            } catch (err) {
              alert('네트워크 오류가 발생했습니다.');
            } finally {
              submitBtn.textContent = originalText;
              submitBtn.disabled = false;
            }
          });
        }
      });
    