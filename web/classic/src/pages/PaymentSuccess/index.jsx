/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useState } from 'react';
import { Button, Progress } from '@douyinfe/semi-ui';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export default function PaymentSuccess() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [seconds, setSeconds] = useState(5);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    const redirect = window.setTimeout(() => {
      navigate('/console/topup');
    }, 5000);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(redirect);
    };
  }, [navigate]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(16, 185, 129, 0.12)',
            color: '#059669',
          }}
        >
          <CheckCircle2 size={36} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>
            {t('Payment successful')}
          </h1>
          <p style={{ margin: '8px 0 0', color: 'var(--semi-color-text-2)' }}>
            {t('Redirecting to top-up page in {{seconds}} seconds', {
              seconds,
            })}
          </p>
        </div>
        <Progress percent={((5 - seconds) / 5) * 100} showInfo={false} />
        <Button type='primary' onClick={() => navigate('/console/topup')}>
          {t('Go to top-up page')}
        </Button>
      </section>
    </main>
  );
}
