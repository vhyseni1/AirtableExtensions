import {BRAND_LOGO} from './branding';

// Renders a brand logo (data URI or URL) when one is set in branding.js,
// otherwise falls back to a neutral text mark. No vendor logo ships here.
export default function Logo({className = ''}) {
    if (BRAND_LOGO) {
        return <img src={BRAND_LOGO} alt="" className={`fp-logo-img ${className}`.trim()} />;
    }
    return <span className={`fp-logo ${className}`.trim()}>FM</span>;
}
