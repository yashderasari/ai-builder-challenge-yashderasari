type ErrorInfo = {
  title: string;
  detail: string;
  action: string;
};

const ERROR_MAP: Record<string, ErrorInfo> = {
  unknown_asset: {
    title: "Tag not registered",
    detail: "This barcode isn't in the system yet.",
    action: "Go to Receive to register it first, then come back.",
  },
  and_match_failed: {
    title: "Wrong instrument",
    detail: "This tag is already registered to a different serial number.",
    action: "Check you scanned the right barcode. If the serials don't match physically, contact your manager.",
  },
  invalid_transition: {
    title: "Can't do that from here",
    detail: "This asset's current state doesn't allow this operation.",
    action: "Check the asset's current state shown above and use the matching workflow.",
  },
  invalid_location: {
    title: "Location didn't save",
    detail: "Something in the location fields wasn't accepted.",
    action: "Check all location fields for typos and try again.",
  },
  incomplete_deploy_location: {
    title: "Rack location incomplete",
    detail: "You need Site, Room, Rack, and Rack Unit (RU) to rack an asset into service.",
    action: "Fill in all four fields — even if the row is unknown, RU is required.",
  },
  invalid_tag_format: {
    title: "Not a valid asset tag",
    detail: "Asset tags start with C followed by exactly 7 digits (e.g. C0001234).",
    action: "Re-scan the barcode or type the tag manually and check the format.",
  },
  same_custodian: {
    title: "Already their asset",
    detail: "This asset is already assigned to that person.",
    action: "Scan a different badge, or confirm the transfer is actually needed.",
  },
  rate_limited: {
    title: "Scanning too fast",
    detail: "The system is rate-limited. You've hit the request limit.",
    action: "Wait a few seconds and try again.",
  },
  network_error: {
    title: "Can't reach the server",
    detail: "The request didn't go through — check your Wi-Fi or network connection.",
    action: "Try again. If it keeps failing, ask someone to check the server.",
  },
  invalid_payload: {
    title: "Something's wrong with the data",
    detail: "The server didn't accept one of the fields.",
    action: "Check all fields for unusual characters and try again.",
  },
  internal_error: {
    title: "Server error",
    detail: "Something went wrong on our end — this isn't your fault.",
    action: "Try again in a moment. If it keeps happening, contact your manager.",
  },
  badge_is_asset_tag: {
    title: "That's an asset tag, not a badge",
    detail: "You scanned an asset barcode instead of a person's badge.",
    action: "Scan the recipient's employee badge, not an asset label.",
  },
  disposed_transfer: {
    title: "Asset has been disposed",
    detail: "This asset is permanently retired and can't be transferred.",
    action: "Double-check you scanned the right barcode.",
  },
  unknown_error: {
    title: "Something went wrong",
    detail: "An unexpected error occurred.",
    action: "Try again. If it persists, contact support.",
  },
};

export function getErrorInfo(code: string): ErrorInfo {
  return ERROR_MAP[code] ?? (ERROR_MAP.unknown_error as ErrorInfo);
}
