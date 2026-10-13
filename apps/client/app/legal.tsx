import LegalPage from '../components/legal/LegalPage';
import { COOKIES, PRIVACY, TERMS } from '../components/legal/documents';

export function TermsRoute() {
    return <LegalPage doc={TERMS} />;
}

export function PrivacyRoute() {
    return <LegalPage doc={PRIVACY} />;
}

export function CookiesRoute() {
    return <LegalPage doc={COOKIES} />;
}

export default TermsRoute;
