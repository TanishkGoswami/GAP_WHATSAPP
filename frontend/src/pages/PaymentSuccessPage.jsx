import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, Loader2 } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

async function getFunctionErrorMessage(error, fallback) {
    try {
        if (error?.context?.json) {
            const body = await error.context.json()
            return body?.error || body?.message || error.message || fallback
        }
    } catch {
        // Keep the fallback path small and predictable.
    }
    return error?.message || fallback
}

export default function PaymentSuccessPage() {
    const navigate = useNavigate()
    const { refreshProfile } = useAuth()
    const [verifying, setVerifying] = useState(true)
    const [plan, setPlan] = useState(null)
    const [walletRecharge, setWalletRecharge] = useState(null)
    const [error, setError] = useState('')

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const paymentLinkId = params.get('razorpay_payment_link_id')
        const kind = params.get('kind')

        const verify = async () => {
            try {
                if (paymentLinkId) {
                    const functionName = kind === 'wallet'
                        ? 'verify-whatsapp-wallet-recharge'
                        : 'verify-whatsapp-subscription'
                    const { data, error: fnError } = await supabase.functions.invoke(functionName, {
                        body: { razorpayPaymentLinkId: paymentLinkId },
                    })
                    if (fnError) throw new Error(await getFunctionErrorMessage(fnError, 'Payment verification failed'))
                    if (data?.plan) setPlan(data.plan)
                    if (kind === 'wallet') setWalletRecharge(data)
                }
                await refreshProfile()
            } catch (err) {
                console.error('Verification error:', err)
                setError(err.message || 'Payment verification failed')
            } finally {
                setVerifying(false)
            }
        }

        verify()
    }, [refreshProfile])

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-10 max-w-md w-full text-center shadow-sm">
                {verifying ? (
                    <>
                        <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Verifying payment...</h2>
                        <p className="text-sm text-gray-500">Please wait while we confirm your subscription.</p>
                    </>
                ) : error ? (
                    <>
                        <Loader2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Verification needs attention</h2>
                        <p className="text-sm text-red-600 mb-8">{error}</p>
                        <button
                            onClick={() => navigate('/billing')}
                            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
                        >
                            Go to Billing
                        </button>
                    </>
                ) : (
                    <>
                        <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Payment Successful!</h2>
                        {plan && (
                            <p className="text-sm text-green-600 font-medium mb-2">
                                {plan} plan activated
                            </p>
                        )}
                        {walletRecharge?.amount_paise && (
                            <p className="text-sm text-green-600 font-medium mb-2">
                                Wallet credited with ₹{Number(walletRecharge.amount_paise / 100).toLocaleString('en-IN')}
                            </p>
                        )}
                        <p className="text-sm text-gray-500 mb-8">
                            {walletRecharge ? 'Your WhatsApp message wallet is ready for campaigns.' : 'Your WhatsApp subscription is now active. Enjoy full access!'}
                        </p>
                        <button
                            onClick={() => navigate(walletRecharge ? '/billing' : '/dashboard')}
                            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
                        >
                            {walletRecharge ? 'Go to Billing' : 'Go to Dashboard'}
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
