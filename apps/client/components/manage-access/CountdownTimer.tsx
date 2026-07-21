import { useEffect, useState } from 'react';
import { Text } from '@/src/web/reactNative';
import { formatTimeRemaining } from '../../utils/manageAccess';

type Props = {
    expiresAt: string;
};

export default function CountdownTimer({ expiresAt }: Props) {
    const [remaining, setRemaining] = useState(() => formatTimeRemaining(expiresAt));

    useEffect(() => {
        setRemaining(formatTimeRemaining(expiresAt));

        const timer = setInterval(() => {
            setRemaining(formatTimeRemaining(expiresAt));
        }, 1000);

        return () => clearInterval(timer);
    }, [expiresAt]);

    return (
        <Text className="text-sm font-semibold text-slate-700">{remaining}</Text>
    );
}
