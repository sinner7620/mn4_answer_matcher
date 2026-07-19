import React from "react"

const paths = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M14 17.5h7M17.5 14v7"/>',
  mistakes: '<path d="M6.5 4.5h9l3 3v12H6.5z"/><path d="M15.5 4.5v3h3"/><path d="m9.5 13 2 2 4-4"/>',
  review: '<path d="M4.8 8.2A8 8 0 1 1 4 14"/><path d="M4.8 4.5v3.7H1.2"/><path d="M12 7.5v5l3.2 1.8"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M8 4v6M16 14v6"/><circle cx="8" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  refresh: '<path d="M20 6v5h-5"/><path d="M18.5 15.5A7.5 7.5 0 1 1 19.7 10"/>',
  total: '<rect x="5" y="4" width="14" height="16" rx="3"/><path d="M9 4V2.8h6V4M9 9h6M9 13h6M9 17h4"/>',
  due: '<circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5v2M12 9v4l2.5 1.5"/>',
  weak: '<path d="M12 3 2.8 20h18.4z"/><path d="M12 9v5M12 17.3v.2"/>',
  mastered: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16.5 9"/>',
  added: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4 4"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  up: '<path d="m7 14 5-5 5 5"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
  answer: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16M9 8h7M9 12h5"/>',
  bind: '<path d="M9.5 14.5 7 17a3.5 3.5 0 0 1-5-5l3.2-3.2a3.5 3.5 0 0 1 5 0"/><path d="m14.5 9.5 2.5-2.5a3.5 3.5 0 0 1 5 5l-3.2 3.2a3.5 3.5 0 0 1-5 0M8.5 15.5l7-7"/>',
  unlink: '<path d="m4 4 16 16M9.5 14.5 7 17a3.5 3.5 0 0 1-5-5l2.5-2.5M14.5 9.5 17 7a3.5 3.5 0 0 1 5 5l-2.5 2.5"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  organize: '<path d="M4 5h6M14 5h6M4 12h10M18 12h2M4 19h3M11 19h9"/><circle cx="12" cy="5" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="19" r="2"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'
}

export function Icon({ name, className = "" }) {
  return <svg className={`uiIcon ${className}`} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: paths[name] || paths.settings }} />
}
