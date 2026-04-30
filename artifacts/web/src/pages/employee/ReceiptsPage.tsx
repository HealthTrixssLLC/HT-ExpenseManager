import { useState, useRef } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetReport,
  getGetReportQueryKey,
  useListReceipts,
  getListReceiptsQueryKey,
  useRequestUploadUrl,
  useRegisterReceipt,
  useListLineItems,
  getListLineItemsQueryKey,
  useAttachReceiptToLine
} from "@workspace/api-client-react";
import { HtCard } from "@/components/brand/Card";
import { ReceiptThumb } from "@/components/brand/ReceiptThumb";
import { Button } from "@/components/ui/button";
import { UploadCloud, Check, Paperclip } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, formatDate } from "@/lib/format";

export function ReceiptsPage({ id }: { id: string }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: report } = useGetReport(id, {
    query: { queryKey: getGetReportQueryKey(id), enabled: !!id }
  });

  const { data: receipts = [] } = useListReceipts(id, {
    query: { queryKey: getListReceiptsQueryKey(id), enabled: !!id }
  });

  const { data: lineItems = [] } = useListLineItems(id, {
    query: { queryKey: getListLineItemsQueryKey(id), enabled: !!id }
  });

  const requestUploadUrl = useRequestUploadUrl();
  const registerReceipt = useRegisterReceipt();
  const attachToLine = useAttachReceiptToLine();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // 1. Get presigned URL
      const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
        data: {
          reportId: id,
          contentType: file.type,
          name: file.name,
          size: file.size,
        }
      });

      // 2. Upload to object storage
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: {
          "Content-Type": file.type
        },
        body: file
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload file to storage.");
      }

      // 3. Register the receipt in our database
      await registerReceipt.mutateAsync({
        id,
        data: {
          objectPath,
          mimeType: file.type,
          filename: file.name,
          sizeBytes: file.size,
        }
      });

      qc.invalidateQueries({ queryKey: getListReceiptsQueryKey(id) });
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err: any) {
      setUploadError(err.message || "An error occurred during upload.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAttach = (receiptId: string, lineItemId: string) => {
    const receipt = receipts.find((r) => r.id === receiptId);
    if (!receipt) return;
    attachToLine.mutate({
      lineId: lineItemId,
      data: {
        objectPath: receipt.objectPath,
        filename: receipt.filename,
        mimeType: receipt.mimeType,
        sizeBytes: receipt.sizeBytes,
        lineItemId,
      }
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListReceiptsQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListLineItemsQueryKey(id) });
      }
    });
  };

  const isEditable = report?.status === "Draft" || report?.status === "Changes Requested";

  return (
    <div className="space-y-6 max-w-5xl" data-testid="page-receipts">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Receipts
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Upload and attach receipts to your expense report.
          </p>
        </div>
        <Link href={`/reports/${id}`}>
          <Button variant="outline">Back to Report</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <HtCard style={{ padding: "1.5rem", minHeight: "400px" }}>
            {receipts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[var(--ht-ink-3)]">
                <Paperclip className="w-12 h-12 mb-4 text-[var(--ht-ink-4)]" />
                <p>No receipts uploaded yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {receipts.map(receipt => (
                  <div key={receipt.id} className="space-y-2">
                    <ReceiptThumb receipt={receipt} size={192} />
                    
                    {isEditable && (
                      <div className="px-1">
                        {receipt.lineItemId ? (
                          <div className="text-xs text-green-700 flex items-center bg-green-50 p-1.5 rounded">
                            <Check className="w-3 h-3 mr-1" />
                            Attached to line item
                          </div>
                        ) : (
                          <Select 
                            onValueChange={(val) => handleAttach(receipt.id, val)}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Attach to line item..." />
                            </SelectTrigger>
                            <SelectContent>
                              {lineItems.map(item => (
                                <SelectItem key={item.id} value={item.id} className="text-xs">
                                  {formatDate(item.occurredOn)} - {item.merchant} ({formatMoney(Number(item.amount))})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </HtCard>
        </div>

        <div>
          <HtCard pad={24}>
            <h3 className="font-medium text-[var(--ht-ink)] mb-4">Upload Receipt</h3>
            
            <div 
              className={`border-2 border-dashed rounded-lg p-8 text-center ${
                isEditable ? 'border-[var(--ht-border)] hover:border-[var(--ht-primary)] cursor-pointer bg-gray-50' : 'border-gray-200 bg-gray-100 opacity-70 cursor-not-allowed'
              }`}
              onClick={() => isEditable && fileInputRef.current?.click()}
            >
              <UploadCloud className={`w-8 h-8 mx-auto mb-3 ${isEditable ? 'text-[var(--ht-primary)]' : 'text-gray-400'}`} />
              <p className="text-sm font-medium text-[var(--ht-ink)]">
                {isUploading ? "Uploading..." : "Click to browse"}
              </p>
              <p className="text-xs text-[var(--ht-ink-3)] mt-1">
                JPG, PNG, or PDF up to 10MB
              </p>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/jpeg,image/png,application/pdf"
                onChange={handleFileChange}
                disabled={!isEditable || isUploading}
              />
            </div>
            
            {uploadError && (
              <p className="mt-3 text-sm text-red-600">{uploadError}</p>
            )}
            
            {!isEditable && (
              <p className="mt-3 text-xs text-[var(--ht-ink-3)] text-center">
                This report can no longer be edited.
              </p>
            )}
          </HtCard>
        </div>
      </div>
    </div>
  );
}
