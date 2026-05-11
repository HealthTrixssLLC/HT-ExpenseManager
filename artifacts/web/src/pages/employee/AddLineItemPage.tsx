import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateLineItem,
  useListCategories,
  getListCategoriesQueryKey,
  getListLineItemsQueryKey,
  getGetReportQueryKey,
  getGetReportTimelineQueryKey,
  getListReceiptsQueryKey,
  getListReportsQueryKey,
  PaymentMethod,
} from "@workspace/api-client-react";
import { HtCard } from "@/components/brand/Card";
import { HelpLink } from "@/components/help/HelpLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle } from "lucide-react";
import { useDirtyGuard, confirmLeaveIfDirty } from "@/hooks/useDirtyGuard";
import { notifySuccess } from "@/lib/notify";

const MERCHANT_MAX = 80;
const DESCRIPTION_MAX = 500;
const AMOUNT_MAX = 100_000;

type FormErrors = {
  occurredOn?: string;
  merchant?: string;
  category?: string;
  amount?: string;
};

export function AddLineItemPage({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [occurredOn, setOccurredOn] = useState(today);
  const [merchant, setMerchant] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.Personal_Card);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const { data: categories = [] } = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() }
  });

  const createLineItem = useCreateLineItem();

  const errors: FormErrors = useMemo(() => {
    const e: FormErrors = {};
    if (!occurredOn) e.occurredOn = "Date is required.";
    else if (new Date(occurredOn) > new Date(today)) e.occurredOn = "Date cannot be in the future.";
    if (!merchant.trim()) e.merchant = "Merchant is required.";
    else if (merchant.length > MERCHANT_MAX) e.merchant = `Merchant must be ${MERCHANT_MAX} characters or fewer.`;
    if (!categoryId) e.category = "Category is required.";
    const amt = Number(amount);
    if (!amount.trim()) e.amount = "Amount is required.";
    else if (Number.isNaN(amt)) e.amount = "Amount must be a number.";
    else if (amt <= 0) e.amount = "Amount must be greater than zero.";
    else if (amt > AMOUNT_MAX) e.amount = `Amount cannot exceed ${AMOUNT_MAX.toLocaleString()}.`;
    else if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) e.amount = "Amount can have up to 2 decimal places.";
    return e;
  }, [occurredOn, merchant, categoryId, amount, today]);

  const isValid = Object.keys(errors).length === 0;

  const isDirty =
    merchant.length > 0 ||
    description.length > 0 ||
    categoryId.length > 0 ||
    amount.length > 0 ||
    occurredOn !== today;

  useDirtyGuard(isDirty && !createLineItem.isSuccess);

  const showError = (k: keyof FormErrors) => touched[k] && errors[k];

  const handleCancel = () => {
    if (confirmLeaveIfDirty(isDirty)) setLocation(`/reports/${id}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ occurredOn: true, merchant: true, category: true, amount: true });
    if (!isValid) return;

    createLineItem.mutate({
      id,
      data: {
        category: categoryId,
        amount: Number(amount).toFixed(2),
        merchant: merchant.trim(),
        description: description.trim() || undefined,
        occurredOn,
        paymentMethod
      }
    }, {
      onSuccess: () => {
        // Refresh everything that displays the new line item or values
        // derived from it — the report's totals/aging in the header, the
        // line items table, the audit timeline, the receipts page (the
        // attach-to-line dropdown lists every line item), and the report
        // listings (My Reports, queues) that show the running total.
        qc.invalidateQueries({ queryKey: getListLineItemsQueryKey(id) });
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
        qc.invalidateQueries({ queryKey: getGetReportTimelineQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListReceiptsQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListReportsQueryKey() });
        notifySuccess("Line item added");
        setLocation(`/reports/${id}`);
      }
    });
  };

  return (
    <div className="space-y-6 max-w-2xl" data-testid="page-addlineitem">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Add Expense
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Enter details for your expense. Policy rules will be applied automatically.
          </p>
        </div>
        <HelpLink topicId="add-line-items" />
      </div>

      <HtCard>
        <form onSubmit={handleSubmit} className="p-6 space-y-6" noValidate>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="occurredOn">Date of Expense <span className="text-red-600">*</span></Label>
              <Input
                id="occurredOn"
                type="date"
                value={occurredOn}
                max={today}
                onChange={(e) => setOccurredOn(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, occurredOn: true }))}
                aria-invalid={!!showError("occurredOn")}
                className={showError("occurredOn") ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {showError("occurredOn") && (
                <div className="text-xs text-red-600">{errors.occurredOn}</div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant">Merchant <span className="text-red-600">*</span></Label>
              <Input
                id="merchant"
                data-testid="input-merchant"
                placeholder="e.g. Delta Airlines"
                value={merchant}
                maxLength={MERCHANT_MAX}
                onChange={(e) => setMerchant(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, merchant: true }))}
                aria-invalid={!!showError("merchant")}
                className={showError("merchant") ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {showError("merchant") && (
                <div className="text-xs text-red-600">{errors.merchant}</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category <span className="text-red-600">*</span></Label>
              <Select
                value={categoryId}
                onValueChange={(v) => { setCategoryId(v); setTouched((t) => ({ ...t, category: true })); }}
              >
                <SelectTrigger
                  id="category"
                  aria-invalid={!!showError("category")}
                  className={showError("category") ? "border-red-500 focus-visible:ring-red-500" : ""}
                  onBlur={() => setTouched((t) => ({ ...t, category: true }))}
                >
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
              {showError("category") && (
                <div className="text-xs text-red-600">{errors.category}</div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount <span className="text-red-600">*</span></Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-[var(--ht-ink-3)]">$</span>
                </div>
                <Input
                  id="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
                  aria-invalid={!!showError("amount")}
                  className={`pl-7 ${showError("amount") ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
              </div>
              {showError("amount") && (
                <div className="text-xs text-red-600">{errors.amount}</div>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-md p-3 flex gap-3 text-sm text-blue-800">
            <AlertCircle className="w-5 h-5 text-blue-500 shrink-0" />
            <div>
              <p className="font-medium mb-1">Company Policy</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Receipts are required for line items above $75.</li>
                <li>Ensure the expense is within the allowed category limit.</li>
              </ul>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment Method</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
              <SelectTrigger id="paymentMethod">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PaymentMethod.Personal_Card}>Personal Card (Reimbursable)</SelectItem>
                <SelectItem value={PaymentMethod.Company_Card}>Company Card</SelectItem>
                <SelectItem value={PaymentMethod.Cash}>Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Business Purpose (optional)</Label>
            <Textarea
              id="description"
              placeholder="Why was this expense necessary?"
              value={description}
              maxLength={DESCRIPTION_MAX}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <div className="text-xs text-[var(--ht-ink-3)] text-right">
              {description.length}/{DESCRIPTION_MAX}
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--ht-border)] flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={handleCancel}>Cancel</Button>
            <Button
              type="submit"
              disabled={createLineItem.isPending}
              data-testid="button-save-line-item"
            >
              {createLineItem.isPending ? "Saving..." : "Save Line Item"}
            </Button>
          </div>
        </form>
      </HtCard>
    </div>
  );
}
