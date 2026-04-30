import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateLineItem,
  useListCategories,
  getListCategoriesQueryKey,
  PaymentMethod,
} from "@workspace/api-client-react";
import { HtCard } from "@/components/brand/Card";
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
import { formatMoney } from "@/lib/format";

export function AddLineItemPage({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().split("T")[0]);
  const [merchant, setMerchant] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.Personal_Card);

  const { data: categories = [] } = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() }
  });

  const createLineItem = useCreateLineItem();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Quick validation
    if (!categoryId || !amount || isNaN(Number(amount))) return;

    createLineItem.mutate({
      id,
      data: {
        category: categoryId,
        amount: amount.toString(),
        merchant,
        description,
        occurredOn,
        paymentMethod: paymentMethod as any
      }
    }, {
      onSuccess: () => {
        setLocation(`/reports/${id}`);
      }
    });
  };

  return (
    <div className="space-y-6 max-w-2xl" data-testid="page-addlineitem">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
          Add Expense
        </h1>
        <p className="text-sm text-[var(--ht-ink-3)]">
          Enter details for your expense. Policy rules will be applied automatically.
        </p>
      </div>

      <HtCard>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="occurredOn">Date of Expense</Label>
              <Input
                id="occurredOn"
                type="date"
                value={occurredOn}
                onChange={e => setOccurredOn(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant">Merchant</Label>
              <Input
                id="merchant"
                data-testid="input-merchant"
                placeholder="e.g. Delta Airlines"
                value={merchant}
                onChange={e => setMerchant(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId} required>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} ({c.qboAccount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-[var(--ht-ink-3)]">$</span>
                </div>
                <Input
                  id="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="pl-7"
                  required
                />
              </div>
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
            <Label htmlFor="description">Business Purpose (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Why was this expense necessary?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="pt-4 border-t border-[var(--ht-border)] flex justify-end gap-3">
            <Link href={`/reports/${id}`}>
              <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button type="submit" disabled={createLineItem.isPending}>
              {createLineItem.isPending ? "Saving..." : "Save Line Item"}
            </Button>
          </div>
        </form>
      </HtCard>
    </div>
  );
}
