import avatar from "../private/train/avatar.glb.gz";
import avatarLow from "../private/train/avatar-low.glb.gz";
import { createAvatarWorker } from "./avatar-auth.mjs";

export default createAvatarWorker({ avatar,avatarLow });
