import {UBS_LOGO} from './branding';

// Renders the bundled UBS logo (data URI or URL) if configured in logo.js,
// otherwise falls back to the red "UBS" text mark.
export default function Logo({className = ''}) {
    if (UBS_LOGO) {
        return <img src={UBS_LOGO} alt="UBS" className={`fp-logo-img ${className}`.trim()} />;
    }
    return <span className={`fp-logo ${className}`.trim()}>UBS</span>;
}
