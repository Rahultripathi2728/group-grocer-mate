import { useState, useEffect, forwardRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowDownLeft, ArrowUpRight, CheckCircle2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Member {
  user_id: string;
  full_name: string;
}

interface Balance {
  from_user: Member;
  to_user: Member;
  amount: number;
}

interface MemberSpending {
  member: Member;
  totalPaid: number;
  totalOwed: number;
  netBalance: number;
}

interface Props {
  balances: Balance[];
  memberSpending: MemberSpending[];
  onSettle: () => void;
  settling: boolean;
}

const SimplifiedBalances = forwardRef<HTMLDivElement, Props>(function SimplifiedBalances({ balances, memberSpending, onSettle, settling }, ref) {
  const { user } = useAuth();
  const [upiMap, setUpiMap] = useState<Record<string, string>>({});

  // Fetch UPI IDs for all members in balances
  useEffect(() => {
    const userIds = new Set<string>();
    balances.forEach((b) => {
      userIds.add(b.from_user.user_id);
      userIds.add(b.to_user.user_id);
    });
    if (userIds.size === 0) return;

    supabase
      .from('profiles')
      .select('id, upi_id')
      .in('id', Array.from(userIds))
      .then(({ data }) => {
        const map: Record<string, string> = {};
        data?.forEach((p: any) => {
          if (p.upi_id) map[p.id] = p.upi_id;
        });
        setUpiMap(map);
      });
  }, [balances]);

  const mySpending = memberSpending.find((ms) => ms.member.user_id === user?.id);
  const myNetBalance = mySpending?.netBalance || 0;

  const iOwe = balances.filter((b) => b.from_user.user_id === user?.id);
  const owedToMe = balances.filter((b) => b.to_user.user_id === user?.id);

  const totalIOwe = iOwe.reduce((sum, b) => sum + b.amount, 0);
  const totalOwedToMe = owedToMe.reduce((sum, b) => sum + b.amount, 0);

  const handleUpiPay = (receiverUpiId: string, amount: number, receiverName: string) => {
    const upiUrl = `upi://pay?pa=${encodeURIComponent(receiverUpiId)}&pn=${encodeURIComponent(receiverName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Group expense settlement')}`;
    window.open(upiUrl, '_blank');
  };

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      {/* Your Balance Header */}
      <div
        className={cn(
          'p-5',
          myNetBalance > 0.01
            ? 'bg-gradient-to-br from-success/15 to-success/5'
            : myNetBalance < -0.01
              ? 'bg-gradient-to-br from-destructive/15 to-destructive/5'
              : 'bg-gradient-to-br from-primary/10 to-primary/5'
        )}
      >
        <p className="text-sm text-muted-foreground mb-1">Your Balance</p>
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'text-3xl font-display font-bold',
              myNetBalance > 0.01
                ? 'text-success'
                : myNetBalance < -0.01
                  ? 'text-destructive'
                  : 'text-foreground'
            )}
          >
            {myNetBalance > 0.01
              ? `+₹${myNetBalance.toFixed(0)}`
              : myNetBalance < -0.01
                ? `-₹${Math.abs(myNetBalance).toFixed(0)}`
                : '₹0'}
          </span>
          <span
            className={cn(
              'text-sm font-medium',
              myNetBalance > 0.01
                ? 'text-success'
                : myNetBalance < -0.01
                  ? 'text-destructive'
                  : 'text-muted-foreground'
            )}
          >
            {myNetBalance > 0.01
              ? 'you are owed'
              : myNetBalance < -0.01
                ? 'you owe'
                : 'all settled up!'}
          </span>
        </div>

        {/* Quick summary chips */}
        <div className="flex gap-3 mt-3">
          {totalIOwe > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/20">
              <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-semibold text-destructive">
                ₹{totalIOwe.toFixed(0)} to pay
              </span>
            </div>
          )}
          {totalOwedToMe > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
              <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
              <span className="text-xs font-semibold text-success">
                ₹{totalOwedToMe.toFixed(0)} to receive
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Transfers */}
      <CardContent className="pt-4 pb-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Who Pays Whom
        </p>

        {balances.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8"
          >
            <div className="inline-flex p-3 rounded-full bg-success/10 mb-3">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <p className="text-lg font-display font-semibold text-success">All Settled Up!</p>
            <p className="text-sm text-muted-foreground">No outstanding balances</p>
          </motion.div>
        ) : (
          <div className="space-y-2.5">
            {balances.map((balance, index) => {
              const isYouPaying = balance.from_user.user_id === user?.id;
              const isYouReceiving = balance.to_user.user_id === user?.id;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08 }}
                  className={cn(
                    'rounded-xl transition-colors overflow-hidden',
                    isYouPaying
                      ? 'bg-destructive/5 border border-destructive/15'
                      : isYouReceiving
                        ? 'bg-success/5 border border-success/15'
                        : 'bg-muted/30 border border-border/50'
                  )}
                >
                  <div className="flex items-center gap-3 p-3.5">
                    {/* From */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className={cn(
                          'h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0',
                          isYouPaying ? 'bg-destructive/20' : 'bg-muted/50'
                        )}
                      >
                        <span className={cn('text-xs font-bold', isYouPaying ? 'text-destructive' : 'text-muted-foreground')}>
                          {balance.from_user.full_name[0]?.toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-medium truncate">
                        {isYouPaying ? 'You' : balance.from_user.full_name}
                      </span>
                    </div>

                    {/* Arrow + Amount */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <div
                        className={cn(
                          'px-3 py-1 rounded-lg font-display font-bold text-sm',
                          isYouPaying
                            ? 'bg-destructive/10 text-destructive'
                            : isYouReceiving
                              ? 'bg-success/10 text-success'
                              : 'bg-primary/10 text-primary'
                        )}
                      >
                        ₹{balance.amount.toFixed(0)}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {/* To */}
                    <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                      <span className="text-sm font-medium truncate text-right">
                        {isYouReceiving ? 'You' : balance.to_user.full_name}
                      </span>
                      <div
                        className={cn(
                          'h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0',
                          isYouReceiving ? 'bg-success/20' : 'bg-muted/50'
                        )}
                      >
                        <span className={cn('text-xs font-bold', isYouReceiving ? 'text-success' : 'text-muted-foreground')}>
                          {balance.to_user.full_name[0]?.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* UPI Pay button - only for the person who owes */}
                  {isYouPaying && (
                    <div className="px-3.5 pb-3 flex gap-2">
                      {upiMap[balance.to_user.user_id] ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-primary/30 text-primary hover:bg-primary/5"
                          onClick={() => handleUpiPay(
                            upiMap[balance.to_user.user_id],
                            balance.amount,
                            balance.to_user.full_name
                          )}
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Pay via UPI
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground italic flex-1 flex items-center">
                          {balance.to_user.full_name} hasn't added UPI ID
                        </span>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Settle button - only for users who owe money */}
        {iOwe.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 flex justify-center"
          >
            <Button
              size="lg"
              className="gradient-primary text-primary-foreground shadow-glow px-8 py-5 text-base hover:scale-105 transition-transform w-full"
              onClick={onSettle}
              disabled={settling}
            >
              <CheckCircle2 className="h-5 w-5 mr-2" />
              {settling ? 'Settling...' : 'Mark All as Settled'}
            </Button>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
