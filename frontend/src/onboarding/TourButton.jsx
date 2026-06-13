import { useEffect, useRef, useState } from 'react'
import { HelpCircle, Map, RefreshCw, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { useOnboarding } from './onboardingContext'

export default function TourButton({ className = '', compact = false }) {
    const { currentPageTour, isRunning, startCurrentPageTour, startGlobalTour, resetAllTours } = useOnboarding()
    const [open, setOpen] = useState(false)
    const menuRef = useRef(null)

    useEffect(() => {
        const handleClick = (event) => {
            if (!menuRef.current?.contains(event.target)) setOpen(false)
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    const run = async (action) => {
        setOpen(false)
        await action()
    }

    return (
        <div ref={menuRef} className={clsx('group relative', className)} data-tour="tour-menu">
            <button
                type="button"
                onClick={() => setOpen(prev => !prev)}
                disabled={isRunning}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-[#0064b7] transition-colors hover:bg-blue-100 disabled:opacity-60"
                aria-label="Show Tour"
            >
                <HelpCircle className="h-4 w-4" />
                {!compact ? <span className="hidden sm:inline">Show Tour</span> : null}
            </button>
            {compact ? (
                <span className="pointer-events-none absolute right-0 top-full z-[120] mt-2 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 opacity-0 shadow-lg shadow-gray-900/10 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    Show Tour
                </span>
            ) : null}

            {open ? (
                <div className="absolute right-0 z-[90] mt-2 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg shadow-gray-900/10">
                    <button
                        type="button"
                        onClick={() => run(startCurrentPageTour)}
                        disabled={!currentPageTour || isRunning}
                        className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Map className="mt-0.5 h-4 w-4 text-[#0064b7]" />
                        <span>
                            <span className="block font-semibold">Start page tour</span>
                            <span className="block text-xs text-gray-500">Current page ka quick guide.</span>
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => run(startGlobalTour)}
                        disabled={isRunning}
                        className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        <Sparkles className="mt-0.5 h-4 w-4 text-[#0064b7]" />
                        <span>
                            <span className="block font-semibold">Start app tour</span>
                            <span className="block text-xs text-gray-500">Main setup guide dobara dekho.</span>
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            resetAllTours()
                            setOpen(false)
                        }}
                        disabled={isRunning}
                        className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        <RefreshCw className="mt-0.5 h-4 w-4 text-gray-500" />
                        <span>
                            <span className="block font-semibold">Reset tour history</span>
                            <span className="block text-xs text-gray-500">First-run guide fir se available hoga.</span>
                        </span>
                    </button>
                </div>
            ) : null}
        </div>
    )
}
