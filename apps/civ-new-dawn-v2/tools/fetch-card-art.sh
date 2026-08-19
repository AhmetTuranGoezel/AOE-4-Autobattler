#!/usr/bin/env bash
# Fetch Civ: A New Dawn card art referenced by assets/card-manifest.json.
# The sheets are hosted on Steam. Run this on a machine that can reach Steam;
# it writes into apps/civ-new-dawn-v2/assets/cards/.
#
# These images are scans of published Fantasy Flight / Asmodee artwork. Fine for
# your own copy of the game; think before publishing them.
set -euo pipefail
cd "$(dirname "$0")/../assets/cards"

echo "-> sheet01"
curl -fsSL --retry 3 -o sheet01.jpg "https://steamusercontent-a.akamaihd.net/ugc/1751309827527195437/E36C51180249964D87DB56E45AA97570BE09FA6D/"
echo "-> sheet02"
curl -fsSL --retry 3 -o sheet02.jpg "https://steamusercontent-a.akamaihd.net/ugc/1751309827527175345/75F3F137E606E8F4240B304785884D565B49C2F2/"
echo "-> sheet03"
curl -fsSL --retry 3 -o sheet03.jpg "https://steamusercontent-a.akamaihd.net/ugc/1751309827527155310/CF9BB49DC02FC6D9B9D2693A86CA0F2E4AA024FD/"
echo "-> sheet04"
curl -fsSL --retry 3 -o sheet04.jpg "https://steamusercontent-a.akamaihd.net/ugc/1751309827527216227/2ABD2EDF59141E83D49FF361F7E60CA3FD1955D5/"
echo "-> sheet05"
curl -fsSL --retry 3 -o sheet05.jpg "https://steamusercontent-a.akamaihd.net/ugc/1751309922441703394/97CAC49E77964815E6689D055751314C19993C96/"
echo "-> sheet06"
curl -fsSL --retry 3 -o sheet06.jpg "https://steamusercontent-a.akamaihd.net/ugc/1751309922441715305/73C9561657B45B6DF96C034D594D597BE698BA25/"
echo "-> sheet07"
curl -fsSL --retry 3 -o sheet07.jpg "https://steamusercontent-a.akamaihd.net/ugc/1751309922441721336/4595A43D813ACE16B76D5E43FE3FCF900552989D/"
echo "-> sheet08"
curl -fsSL --retry 3 -o sheet08.jpg "https://steamusercontent-a.akamaihd.net/ugc/1751309922441740203/3023516E2AAF3E916E6E5887DCAA8330AE06C612/"
echo "-> sheet09"
curl -fsSL --retry 3 -o sheet09.jpg "https://steamusercontent-a.akamaihd.net/ugc/1751309922441889396/2F5B4E54E4AB2D88D0AD8C497EA44DD2B34A9611/"
echo "-> sheet10"
curl -fsSL --retry 3 -o sheet10.jpg "https://steamusercontent-a.akamaihd.net/ugc/1751309827527482216/3F39DF4C874B8570B1DEEF507E0F4D3063FBFD13/"
echo "-> sheet11"
curl -fsSL --retry 3 -o sheet11.jpg "https://steamusercontent-a.akamaihd.net/ugc/1751309827530376001/E0468CC211B6E705A8A6AD4974C27EB8BF0B8999/"

echo
echo "done: $(ls -1 *.jpg 2>/dev/null | wc -l) / 11 sheets"
