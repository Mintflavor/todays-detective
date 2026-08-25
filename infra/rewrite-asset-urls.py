# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# 초상화 URL 일괄 갱신. api 컨테이너 안에서 실행한다.
#
#   docker cp infra/rewrite-asset-urls.py todays-detective-api:/tmp/
#   docker exec -w /app todays-detective-api python /tmp/rewrite-asset-urls.py <OLD_BASE> [--apply]
#
# --apply 없이 실행하면 변경 대상만 보여주는 dry-run이다.
#
# 주의: portraitImage가 base64 문자열인 구 데이터는 건드리지 않는다
#       (프론트가 startsWith('http')로 분기하므로 그대로 두면 정상 동작한다).

import sys

sys.path.insert(0, "/app")

from app import db  # noqa: E402
from app.config import get_settings  # noqa: E402


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apply = "--apply" in sys.argv
    if not args:
        print("사용법: python rewrite-asset-urls.py <이전_접두어> [--apply]")
        print("  예: python rewrite-asset-urls.py https://cdn.detective.example.com/todays-detective")
        return 2

    old_base = args[0].rstrip("/")
    new_base = get_settings().public_asset_base_url
    if old_base == new_base:
        print("이전 접두어와 현재 PUBLIC_ASSET_BASE_URL이 같습니다. 할 일이 없습니다.")
        return 0

    print("이전 접두어: %s" % old_base)
    print("새 접두어  : %s" % new_base)
    print("모드       : %s" % ("적용" if apply else "dry-run (변경하지 않음)"))
    print()

    col = db.get_scenarios()
    docs = list(col.find({"case_data.suspects.portraitImage": {"$regex": "^" + old_base}}))
    print("대상 시나리오: %d건" % len(docs))

    changed_docs = 0
    changed_urls = 0
    skipped_base64 = 0

    for doc in docs:
        suspects = doc.get("case_data", {}).get("suspects") or []
        touched = False
        for s in suspects:
            if not isinstance(s, dict):
                continue
            img = s.get("portraitImage")
            if not isinstance(img, str) or not img:
                continue
            if not img.startswith("http"):
                # base64 레거시 — 절대 건드리지 않는다
                skipped_base64 += 1
                continue
            if img.startswith(old_base):
                new_url = new_base + img[len(old_base):]
                print("  %s" % s.get("name"))
                print("    - %s" % img)
                print("    + %s" % new_url)
                s["portraitImage"] = new_url
                changed_urls += 1
                touched = True
        if touched:
            changed_docs += 1
            if apply:
                col.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"case_data.suspects": suspects}},
                )

    print()
    print("문서 %d건 / URL %d개%s" % (changed_docs, changed_urls,
                                     " 갱신 완료" if apply else " 이 변경될 예정"))
    if skipped_base64:
        print("base64 레거시 %d개는 건드리지 않았습니다." % skipped_base64)
    if not apply and changed_urls:
        print("\n실제 적용: 같은 명령에 --apply 를 붙여 다시 실행하세요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
