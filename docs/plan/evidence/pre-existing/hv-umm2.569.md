# hv-umm2.569 pre-existing issues

Astral Interface UUID ee1ef770-29ea-4a63-a1f9-7e97b5b8870d exposes the whole updated hand as legal discard candidates. Desktop and mobile captures show the prior synthetic physical card i1 and bonus-drawn i2 with the same purple legal ring. The selected prior card receives orange emphasis; the just-drawn card has no distinct emphasis. Candidate wrapper attributes report neither card highlighted. This combines actual visual inspection with the existing adapter mapping and ringCandidates behavior; highlighted=false alone is not the visual proof.

The physical workflow passes: i1 is discarded to the void, i2 remains in hand, public draw precedes discard, and Caps is empty. Actual 2× captures: astral-desktop-offer.png, astral-desktop-selected.png, astral-mobile-offer.png, astral-mobile-selected.png. QA ledger intentionally records presentation failures on both viewports, linked to **hv-umm2.566**, whose owner corrects and rejudges this outside-Areas issue.

The runtime Dreamwell test fixture uses the synthetic qa-scene-dreamwell UUID supplied by battleSceneContent, with pending fallback definitions. It is independent of the companion production UUID; inspection confirms no production-data fixture issue here.
