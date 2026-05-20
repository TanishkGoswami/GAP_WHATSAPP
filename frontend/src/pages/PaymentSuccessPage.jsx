import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, Loader2 } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function PaymentSuccessPage() {
    const navigate = useNavigate()
    const { refreshProfile } = useAuth()
    const [verifying, setVerifying] = useState(true)
    const [plan, setPlan] = useState(null)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const paymentLinkId = params.get('razorpay_payment_link_id')

        const verify = async () => {
            try {
                if (paymentLinkId) {
                    const { data } = await supabase.functions.invoke('verify-whatsapp-subscription', {
                        body: { razorpayPaymentLinkId: paymentLinkId },
                    })
                    if (data?.plan) setPlan(data.plan)
                }
                await refreshProfile()
            } catch (err) {
                console.error('Verification error:', err)
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
                ) : (
                    <>
                        <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Payment Successful!</h2>
                        {plan && (
                            <p className="text-sm text-green-600 font-medium mb-2">
                                {plan} plan activated
                            </p>
                        )}
                        <p className="text-sm text-gray-500 mb-8">
                            Your WhatsApp subscription is now active. Enjoy full access!
                        </p>
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
                        >
                            Go to Dashboard
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
