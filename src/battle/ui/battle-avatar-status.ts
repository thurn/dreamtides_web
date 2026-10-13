import type { BattleAvatarSummary } from "../types";
import type { MobileBattleStatusView } from "../../cumulus/screens/MobileBattleScreen";
const FALLBACK_PLAYER_AVATAR = {
  imageNumber: "001",
  name: "Avatar",
  title: "",
} as const;

const INACTIVE_OPPONENT_AVATAR_ABILITY = "Opponent avatar ability is not active.";

/** The Avatar identity a side's status display shows; the fallback when it has no Avatar. */
export function buildBattleAvatarStatus(
  summary: BattleAvatarSummary | typeof FALLBACK_PLAYER_AVATAR | null,
  abilityUnavailable: boolean,
): Pick<MobileBattleStatusView, "avatar" | "avatarProfile"> {
  const avatar = summary ?? FALLBACK_PLAYER_AVATAR;
  return {
    avatar: {
      imageNumber: avatar.imageNumber,
      name:
        "id" in avatar
          ? avatar.name
          : "Avatar",
      title:
        avatar.title === ""
          ? undefined
          : avatar.title,
      ...("portraitFocus" in avatar &&
      avatar.portraitFocus !== undefined
        ? { portraitFocus: avatar.portraitFocus }
        : {}),
    },
    ...("id" in avatar && "renderedText" in avatar
      ? {
          avatarProfile: {
            id: avatar.id,
            ability: abilityUnavailable
              ? INACTIVE_OPPONENT_AVATAR_ABILITY
              : avatar.renderedText,
            ...(abilityUnavailable ? { unavailable: true } : {}),
          },
        }
      : {}),
  };
}
