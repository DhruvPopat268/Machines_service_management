import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { History, ArrowRight, Package, AlertCircle } from "lucide-react";
import Spinner from "@/components/Spinner";
import api from "@/lib/axiosInterceptor";

interface StockAdjustment {
  machineId: string;
  machineName: string;
  modelNumber: string;
  previousQuantity: number;
  newQuantity: number;
  difference: number;
  type: string;
  serialNumbersReturned: string[];
  serialNumbersDeducted: string[];
}

interface InvoiceAuditLog {
  _id: string;
  invoiceNumber: string;
  editedByName: string;
  editDate: string;
  reason: string;
  previousGrandTotalWithGst: number;
  newGrandTotalWithGst: number;
  totalDifference: number;
  previousPaidAmount: number;
  newPaidAmount: number;
  previousRemainingAmount: number;
  newRemainingAmount: number;
  previousPaymentStatus: string;
  newPaymentStatus: string;
  previousCustomerName?: string;
  newCustomerName?: string;
  stockAdjustments: StockAdjustment[];
  createdAt: string;
}

interface InvoiceAuditDialogProps {
  saleId: string | null;
  invoiceNumber?: string;
  open: boolean;
  onClose: () => void;
}

export const InvoiceAuditDialog: React.FC<InvoiceAuditDialogProps> = ({
  saleId,
  invoiceNumber,
  open,
  onClose,
}) => {
  const [logs, setLogs] = useState<InvoiceAuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && saleId) {
      setLoading(true);
      api
        .get(`/admin/sales/${saleId}/audit-logs`)
        .then((res) => {
          setLogs(res.data.data || []);
        })
        .catch((err) => {
          console.error("Failed to load audit logs", err);
          setLogs([]);
        })
        .finally(() => setLoading(false));
    } else {
      setLogs([]);
    }
  }, [open, saleId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-muted/40">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <DialogTitle className="text-lg">
              Invoice Edit History — <span className="font-mono">{invoiceNumber || "Invoice"}</span>
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit trail of all edits, stock changes, and financial adjustments for this invoice
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-12 flex justify-center">
              <Spinner />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <History className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">No edit history found</p>
              <p className="text-xs">This invoice has not been edited yet.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-primary/20 ml-3 space-y-6 pl-6">
              {logs.map((log) => {
                const date = new Date(log.editDate || log.createdAt).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                });

                return (
                  <div key={log._id} className="relative group">
                    {/* Timeline bullet */}
                    <div className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-primary bg-background shadow" />

                    <div className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
                      {/* Top Bar: Editor, Date, Reason */}
                      <div className="flex items-center justify-between border-b pb-2">
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            Edited by <span className="text-primary">{log.editedByName || "Admin"}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">{date}</p>
                        </div>
                        {log.reason && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
                            Reason: <span className="font-medium text-foreground">{log.reason}</span>
                          </span>
                        )}
                      </div>

                      {/* Financial Diff */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-muted/30 p-2.5 rounded-md">
                        <div>
                          <span className="text-muted-foreground block text-[10px] uppercase">Grand Total</span>
                          <span className="line-through text-muted-foreground mr-1">
                            ₹{log.previousGrandTotalWithGst?.toLocaleString() || 0}
                          </span>
                          <ArrowRight className="inline h-3 w-3 text-muted-foreground mx-0.5" />
                          <span className="font-semibold text-foreground">
                            ₹{log.newGrandTotalWithGst?.toLocaleString() || 0}
                          </span>
                        </div>

                        <div>
                          <span className="text-muted-foreground block text-[10px] uppercase">Difference</span>
                          <span
                            className={`font-semibold ${
                              (log.totalDifference || 0) >= 0 ? "text-blue-600" : "text-amber-600"
                            }`}
                          >
                            {(log.totalDifference || 0) > 0 ? "+" : ""}
                            ₹{(log.totalDifference || 0).toLocaleString()}
                          </span>
                        </div>

                        <div>
                          <span className="text-muted-foreground block text-[10px] uppercase">Paid Amount</span>
                          <span className="font-medium text-green-600">
                            ₹{log.newPaidAmount?.toLocaleString() || 0}
                          </span>
                        </div>

                        <div>
                          <span className="text-muted-foreground block text-[10px] uppercase">Balance Remaining</span>
                          <span className="font-medium text-red-500">
                            ₹{log.newRemainingAmount?.toLocaleString() || 0}
                          </span>
                        </div>
                      </div>

                      {/* Customer Change (if changed) */}
                      {log.previousCustomerName &&
                        log.newCustomerName &&
                        log.previousCustomerName !== log.newCustomerName && (
                          <div className="text-xs flex items-center gap-1.5 text-muted-foreground bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1.5 rounded">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            <span>
                              Customer changed from <strong>{log.previousCustomerName}</strong> to{" "}
                              <strong>{log.newCustomerName}</strong>
                            </span>
                          </div>
                        )}

                      {/* Stock Adjustments (100% unit-level log detail) */}
                      {log.stockAdjustments && log.stockAdjustments.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Package className="h-3.5 w-3.5" /> Stock Adjustments & Serial Tracking
                          </p>
                          <div className="divide-y border rounded-md text-xs">
                            {log.stockAdjustments.map((sa, idx) => (
                              <div key={idx} className="p-2.5 flex flex-col gap-1 hover:bg-muted/10">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-foreground">
                                    {sa.machineName} {sa.modelNumber ? `(${sa.modelNumber})` : ""}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">
                                      Qty: {sa.previousQuantity} <ArrowRight className="inline h-3 w-3" /> {sa.newQuantity}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                        sa.type === "serial_swapped"
                                          ? "bg-purple-100 text-purple-700"
                                          : sa.type === "item_added" || sa.type === "quantity_increased"
                                          ? "bg-blue-100 text-blue-700"
                                          : sa.type === "item_removed" || sa.type === "quantity_decreased"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "bg-gray-100 text-gray-700"
                                      }`}
                                    >
                                      {sa.type.replace(/_/g, " ")}
                                    </span>
                                  </div>
                                </div>

                                {/* Returned Serials Badge */}
                                {sa.serialNumbersReturned && sa.serialNumbersReturned.length > 0 && (
                                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 mt-0.5">
                                    <span className="font-semibold bg-emerald-100 border border-emerald-200 px-1.5 py-0.2 rounded text-[10px]">
                                      +Restocked ({sa.serialNumbersReturned.length})
                                    </span>
                                    <span className="font-mono">{sa.serialNumbersReturned.join(", ")}</span>
                                  </div>
                                )}

                                {/* Deducted Serials Badge */}
                                {sa.serialNumbersDeducted && sa.serialNumbersDeducted.length > 0 && (
                                  <div className="flex items-center gap-1.5 text-[11px] text-blue-700 mt-0.5">
                                    <span className="font-semibold bg-blue-100 border border-blue-200 px-1.5 py-0.2 rounded text-[10px]">
                                      -Sold ({sa.serialNumbersDeducted.length})
                                    </span>
                                    <span className="font-mono">{sa.serialNumbersDeducted.join(", ")}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-muted/20">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
