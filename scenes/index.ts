import type { SceneSpec } from "../src/engine/spec";
import brakeCheck from "./brake-check.scene";
import installDay from "./install-day.scene";
import midnightDonuts from "./midnight-donuts.scene";
import missedTaxi from "./missed-taxi.scene";
import mudMoney from "./mud-money.scene";
import ninePlusTen from "./nine-plus-ten.scene";
import pickupFriend from "./pickup-friend.scene";

/** Every scene that shows up in Remotion Studio and the CLI. Add new scenes here. */
export const scenes: SceneSpec[] = [pickupFriend, installDay, midnightDonuts, missedTaxi, brakeCheck, ninePlusTen, mudMoney];
