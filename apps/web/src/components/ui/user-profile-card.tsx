'use client';

import * as React from 'react';
import { Mail, User } from 'lucide-react';
import { motion, type Transition } from 'framer-motion';
import { cn } from '@/lib/utils';

const transition: Transition = { type: 'spring', stiffness: 300, damping: 30 };

type UserProfileCardProps = {
    name: string;
    email: string;
    role?: string | null;
    activityTimeline?: React.ReactNode;
    className?: string;
};

function initials(name: string) {
    return name
        .split(' ')
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

export function UserProfileCard({ name, email, role, activityTimeline, className }: UserProfileCardProps) {
    const [hasExpanded, setHasExpanded] = React.useState(false);
    const state = hasExpanded ? 'expanded' : 'collapsed';

    return (
        <motion.div
            className={cn(
                'w-full',
                className,
            )}
            initial="collapsed"
            animate={state}
            onMouseEnter={() => setHasExpanded(true)}
            onFocus={() => setHasExpanded(true)}
        >
            <motion.div
                layout="position"
                transition={transition}
                className="border border-[color:color-mix(in_srgb,var(--brand-secondary)_18%,transparent)] bg-card px-3 py-3 shadow-sm"
            >
                <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center  bg-[var(--brand-primary)] text-xs font-semibold text-white">
                        {initials(name) || <User className="size-4" />}
                    </div>
                    <div className="min-w-0">
                        <h1 className="truncate text-sm font-semibold text-foreground">{name}</h1>
                        <p className="truncate text-xs font-medium text-muted-foreground">{role || 'Evidence owner'}</p>
                    </div>
                </div>

                <motion.div
                    variants={{
                        collapsed: { height: 0, opacity: 0, marginTop: 0 },
                        expanded: { height: 'auto', opacity: 1, marginTop: '12px' },
                    }}
                    transition={{ staggerChildren: 0.1, ...transition }}
                    className="overflow-hidden"
                >
                    <motion.div
                        variants={{ collapsed: { opacity: 0, y: 10 }, expanded: { opacity: 1, y: 0 } }}
                        transition={transition}
                        className="border border-[color:color-mix(in_srgb,var(--brand-secondary)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-secondary)_4%,transparent)] p-2"
                    >
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-secondary)]">
                                    Activity timeline
                                </p>
                                <p className="text-[10px] text-muted-foreground">Latest request movement</p>
                            </div>
                            <span className=" bg-[color:color-mix(in_srgb,var(--brand-primary)_10%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand-primary)]">
                                Live
                            </span>
                        </div>
                        {activityTimeline ?? (
                            <p className="border border-border bg-background/60 p-2 text-xs text-muted-foreground">
                                No activity yet.
                            </p>
                        )}
                    </motion.div>
                </motion.div>
            </motion.div>

            <div className="flex items-center gap-2 px-1 pt-2">
                <div className="flex size-5 items-center justify-center  bg-[var(--brand-secondary)] text-white">
                    <Mail className="size-3" />
                </div>
                <span className="truncate text-xs font-medium text-muted-foreground">{email}</span>
            </div>
        </motion.div>
    );
}

export const Component = UserProfileCard;