import avatar from "../private/train/avatar.glb";
import avatarLow from "../private/train/avatar-low.glb";
import { createAvatarWorker } from "./avatar-auth.mjs";

export default createAvatarWorker({ avatar,avatarLow });
