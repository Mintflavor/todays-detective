// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

/**
 * 사건 서류철 — 심문 중에 증거와 피해자 정보를 확인하는 곳.
 *
 * 예전에는 이 정보를 보려면 "서류 다시보기"로 브리핑 화면까지 나갔다가 돌아와야 했다.
 * 조서를 덮고 다른 방에 다녀오는 셈이라 대화 맥락이 끊겼다.
 * 그래서 같은 화면 안에 둔다 — 데스크톱은 조서 옆에 펼쳐두고,
 * 모바일은 아래에서 끌어올리는 서류철로 조서 위에 겹친다.
 *
 * 표시하는 것은 전부 서버 **정화본**에 있는 필드뿐이다.
 * `solution`·`timeline_truth`·용의자의 `secret` 계열은 애초에 오지 않는다.
 */

import React from 'react';
import { FileText, Package, UserX, MapPin } from 'lucide-react';
import { CaseData } from '../types/game';

interface CaseFileRailProps {
  caseData: CaseData;
}

/** 서류철 안의 한 절. 제목은 붉은 관인 색으로 찍는다. */
function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-1.5 mb-2 font-dossier text-[10px] font-bold uppercase tracking-[0.22em] text-stamp">
        {icon}
        {label}
      </h3>
      {children}
    </section>
  );
}

export default function CaseFileRail({ caseData }: CaseFileRailProps) {
  const { victim_info: victim, world_setting: world, evidence_list: evidence } = caseData;

  return (
    <div className="font-record text-ink">
      {/* 사건 개요 */}
      <Section icon={<FileText size={11} />} label="사건 개요">
        <p className="text-[14px] leading-[1.85] text-ink-soft">{caseData.summary}</p>
      </Section>

      <hr className="my-4 border-0 border-t border-dashed border-ink/20" />

      {/* 현장 */}
      <Section icon={<MapPin size={11} />} label="현장">
        <dl className="space-y-1.5 text-[14px]">
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-ink-faint">장소</dt>
            <dd className="flex-1">{world.location}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-ink-faint">기상</dt>
            <dd className="flex-1">{world.weather}</dd>
          </div>
        </dl>
      </Section>

      <hr className="my-4 border-0 border-t border-dashed border-ink/20" />

      {/* 피해 */}
      <Section icon={<UserX size={11} />} label="피해자">
        <dl className="space-y-1.5 text-[14px]">
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-ink-faint">성명</dt>
            <dd className="flex-1 font-bold">{victim.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-ink-faint">발생</dt>
            <dd className="flex-1 font-type text-[13px]">{victim.incident_time}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-ink-faint">피해</dt>
            <dd className="flex-1 leading-relaxed">{victim.damage_details}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-ink-faint">상태</dt>
            <dd className="flex-1 leading-relaxed">{victim.body_condition}</dd>
          </div>
        </dl>
      </Section>

      <hr className="my-4 border-0 border-t border-dashed border-ink/20" />

      {/*
        증거. 개수가 사건마다 다르므로 (프롬프트에서 서버가 뽑아 주입한다)
        고정 3칸을 가정하지 않는다.
      */}
      <Section icon={<Package size={11} />} label={`압수 증거 ${evidence.length}건`}>
        <ol className="space-y-2.5">
          {evidence.map((e, i) => (
            <li
              key={`${e.name}-${i}`}
              className="border-l-2 border-stamp/30 pl-2.5"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="font-type text-[10px] text-stamp">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[14px] font-bold">{e.name}</span>
              </div>
              <p className="mt-0.5 text-[13px] leading-[1.75] text-ink-soft">
                {e.description}
              </p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
