import { t, currentLanguage } from '../language';
import { LockKeyhole } from 'lucide-react';
export function AccessDenied({ area, owner }: { area: string; owner?: string }) {
  return (
    <div className="access-overlay" role="note">
      <div className="access-card">
        <LockKeyhole size={26} />
        <h3>{t('Access denied')}</h3>
        <p>
          {currentLanguage() === 'bn'
            ? `${t(area)} ব্যবহারের জন্য মালিকের অধিকার দরকার। দর্শক তথ্য দেখতে ও অ্যালার্ম স্বীকার করতে পারেন।`
            : `${area} requires Owner access. Viewers can read tank data and acknowledge alarms.`}
        </p>
        <p className="access-request">
          {currentLanguage() === 'bn'
            ? `${owner || 'পরিবারের মালিক'}-এর কাছে অধিকার পরিবর্তনের অনুরোধ করুন।`
            : `Request an access change from ${owner || 'your household owner'}.`}
        </p>
      </div>
    </div>
  );
}
