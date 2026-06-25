import React, { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { loreleiNeutral } from '@dicebear/collection';

export default function DiceBearAvatar({ seed, className }) {
    const avatarDataUri = useMemo(() => {
        return createAvatar(loreleiNeutral, {
            seed: seed || 'Unknown',
            backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
        }).toDataUri();
    }, [seed]);

    return (
        <img
            src={avatarDataUri}
            alt={seed || 'Avatar'}
            className={className}
            loading="lazy"
        />
    );
}
