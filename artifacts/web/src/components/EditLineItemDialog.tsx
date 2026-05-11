import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateLineItem,
  useListCategories,
  getListCategoriesQueryKey,
  getListLineItemsQueryKey,
  getGetReportQueryKey,
  getGetReportTimelineQueryKey,
  getListReportsQueryKey,
  PaymentMethod,
  type LineItem,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notifySuccess } from "@/lib/notify";
import { SILENT_404_META } from "@/lib/queryClient";

const MERCHANT_MAX = 80;
const DESCRIPTION_MAX = 500;
const AMOUNT_MAX = 100_000;

type Props = {
  reportId: string;
  lineItem: LineItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditLineItemDialog({
  reportId,
  lineItem,
  open,
  onOpenChange,
}: Props) {
  const qc = useQueryClient();
  const updateLineItem = useUpdateLineItem();
  const { data: categories = [] } = useListCategories({
    query: {
      queryKey: getListCategoriesQueryKey(),
      enabled: open,
      meta: SILENT_404_META,
    },
  });

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [occurredOn, setOccurredOn] = useState(lineItem.occurredOn);
  const [merchant, setMerchant] = useState(lineItem.merchant);
  const [description, setDescription] = useState(lineItem.description ?? "");
  const [categoryCode, setCategoryCode] = useState(lineItem.category ?? "");
  const [amount, setAmount] = useState(String(lineItem.amount));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    lineItem.paymentMethod,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setOccurredOn(lineItem.occurredOn);
      setMerchant(lineItem.merchant);
      setDescription(lineItem.description ?? "");
      setCategoryCode(lineItem.category ?? "");
      setAmount(String(lineItem.amount));
      setPaymentMethod(lineItem.paymentMethod);
      setError(null);
    }
  }, [open, lineItem]);

  const validate = (): string | null => {
    if (!occurredOn) return "Date is required.";
    if (new Date(occurredOn) > new Date(today))
      return "Date cannot be in the future.";
    if (!merchant.trim()) return "Merchant is required.";
    if (merchant.length > MERCHANT_MAX)
      return `Merchant must be ${MERCHANT_MAX} characters or fewer.`;
    if (!categoryCode) return "Category is required.";
    if (!amount.trim()) return "Amount is required.";
    const amt = Number(amount);
    if (Number.isNaN(amt)) return "Amount must be a number.";
    if (amt <= 0) return "Amount must be greater than zero.";
    if (amt > AMOUNT_MAX)
      return `Amount cannot exceed ${AMOUNT_MAX.toLocaleString()}.`;
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()))
      return "Amount can have up to 2 decimal places.";
    return null;
  };

  const handleSave = () => {
    const errMsg = validate();
    if (errMsg) {
      setError(errMsg);
      return;
    }
    updateLineItem.mutate(
      {
        lineId: lineItem.id,
        data: {
          category: categoryCode,
          amount: Number(amount).toFixed(2),
          merchant: merchant.trim(),
          description: description.trim(),
          occurredOn,
          paymentMethod,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({
            queryKey: getListLineItemsQueryKey(reportId),
          });
          qc.invalidateQueries({ queryKey: getGetReportQueryKey(reportId) });
          qc.invalidateQueries({
            queryKey: getGetReportTimelineQueryKey(reportId),
          });
          // Report totals shown on My Reports / Manager / Finance / Payroll
          // listings are derived from line items; refresh those listings.
          qc.invalidateQueries({ queryKey: getListReportsQueryKey() });
          notifySuccess("Line item updated");
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          const detail =
            (err as { detail?: string; message?: string })?.detail ??
            (err as Error)?.message ??
            "Could not save line item.";
          setError(detail);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="dialog-edit-line-item">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="li-occurredOn">Date</Label>
              <Input
                id="li-occurredOn"
                type="date"
                value={occurredOn}
                max={today}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="li-merchant">Merchant</Label>
              <Input
                id="li-merchant"
                value={merchant}
                maxLength={MERCHANT_MAX}
                onChange={(e) => setMerchant(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="li-category">Category</Label>
              <Select value={categoryCode} onValueChange={setCategoryCode}>
                <SelectTrigger id="li-category">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} ({c.qboAccount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="li-amount">Amount</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-[var(--ht-ink-3)]">$</span>
                </div>
                <Input
                  id="li-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="li-payment">Payment Method</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
            >
              <SelectTrigger id="li-payment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PaymentMethod.Personal_Card}>
                  Personal Card (Reimbursable)
                </SelectItem>
                <SelectItem value={PaymentMethod.Company_Card}>
                  Company Card
                </SelectItem>
                <SelectItem value={PaymentMethod.Cash}>Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="li-description">Business Purpose (optional)</Label>
            <Textarea
              id="li-description"
              value={description}
              maxLength={DESCRIPTION_MAX}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600" role="alert">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateLineItem.isPending}
            data-testid="button-save-line-item"
          >
            {updateLineItem.isPending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
