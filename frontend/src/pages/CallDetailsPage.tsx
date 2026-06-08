import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { serviceCallsApi, engineersApi } from "@/services/serviceCallsApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusTimeline } from "@/components/StatusTimeline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, User, Wrench, Paperclip, UserPlus, UserCog, StickyNote, Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import Spinner from "@/components/Spinner";

const formatDate = (dateString: string) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (dateString: string) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  const datePart = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${datePart}, ${timePart}`;
};

const CallDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [attachmentsDialog, setAttachmentsDialog] = useState<{ machineName: string; images: string[] } | null>(null);
  const [assignDialog, setAssignDialog] = useState(false);
  const [noteDialog, setNoteDialog] = useState(false);
  const [priorityDialog, setPriorityDialog] = useState(false);
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [selectedPriority, setSelectedPriority] = useState("");

  const [engineers, setEngineers] = useState<{ _id: string; name: string; isOnline?: boolean }[]>([]);

  const { data: call, isLoading, isFetching } = useQuery({
    queryKey: ["serviceCall", id],
    queryFn: () => serviceCallsApi.getCallDetail(id!),
    enabled: !!id,
    staleTime: 0,
  });

  useEffect(() => {
    engineersApi.getActive().then(setEngineers).catch(() => {});
  }, []);

  if (isLoading || isFetching) return <Spinner />;
  if (!call) return <div className="text-center py-12 text-muted-foreground">Call not found</div>;

  const timelineSteps = [
    { label: "Call Created",      date: formatDateTime(call.dates.created),                description: "Service call registered",              completed: true },
    { label: "Engineer Assigned", date: formatDateTime(call.dates.assigned || ""),         description: call.engineerInfo ? `Assigned to ${call.engineerInfo.name}` : undefined, completed: !!call.dates.assigned,        active: call.status === "Assigned" },
    { label: "Travel Started",    date: formatDateTime(call.dates.travelStarted || ""),    description: "Engineer on the way",                  completed: !!call.dates.travelStarted,   active: call.status === "Travel Started" },
    { label: "Reached Location",  date: formatDateTime(call.dates.reachedLocation || ""), description: "Engineer arrived at customer site",     completed: !!call.dates.reachedLocation, active: call.status === "Reached Location" },
    { label: "Work In Progress",  date: formatDateTime(call.dates.inProgress || ""),      description: "Engineer working on site",             completed: !!call.dates.inProgress,      active: call.status === "In Progress" },
    ...((call.dates as any).onHold ? [{ label: "On Hold", date: formatDateTime((call.dates as any).onHold), description: (call as any).onHoldReason || "Work paused", completed: !!(call.dates as any).onHold, active: call.status === "On Hold" }] : []),
    { label: "Completed",         date: formatDateTime(call.dates.completed || ""),        description: "Issue resolved",                       completed: !!call.dates.completed },
  ];

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{call.callId}</h1>
            <StatusBadge status={call.status} />
          </div>
        </div>
        {/* Quick action buttons */}
        <div className="flex items-center gap-2">
          {(call.status === "Open" || call.status === "Assigned") && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { setSelectedEngineerId(call.engineerInfo?._id || ""); setAssignDialog(true); }}>
            {call.status === "Open" ? <UserPlus className="h-4 w-4" /> : <UserCog className="h-4 w-4" />}
            {call.status === "Open" ? "Assign Engineer" : "Reassign Engineer"}
          </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { setNote(call.note || ""); setNoteDialog(true); }}>
            <StickyNote className="h-4 w-4" /> Add Note
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { setSelectedPriority(call.priority || ""); setPriorityDialog(true); }}>
            <Flag className="h-4 w-4" /> Set Priority
          </Button>
        </div>
      </div>

      {/* Top section: Customer Info + Quick Info + Status Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5" /> Customer Info</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted-foreground">Name</p><p className="font-medium">{call.customerInfo.name}</p></div>
                <div><p className="text-muted-foreground">Email</p><p className="font-medium">{call.customerInfo.email}</p></div>
                <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{call.customerInfo.phone}</p></div>
                <div><p className="text-muted-foreground">Address</p><p className="font-medium">{call.customerInfo.address}</p></div>
                <div><p className="text-muted-foreground">Zone</p><p className="font-medium">{call.customerInfo.zone || "N/A"}</p></div>
                <div><p className="text-muted-foreground">GST Number</p><p className="font-medium">{call.customerInfo.gstNumber || "N/A"}</p></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><UserCog className="h-5 w-5" /> Engineer Info</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Assigned Engineer</p>
                  <p className={`font-medium ${!call.engineerInfo ? "text-muted-foreground italic" : ""}`}>
                    {call.engineerInfo?.name || "Not Assigned"}
                  </p>
                </div>
                {call.engineerInfo && (
                  <>
                    <div><p className="text-muted-foreground">Engineer ID</p><p className="font-medium">{call.engineerInfo.identityId || "N/A"}</p></div>
                    <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{call.engineerInfo.phone || "N/A"}</p></div>
                    <div><p className="text-muted-foreground">Email</p><p className="font-medium">{call.engineerInfo.email || "N/A"}</p></div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Quick Info</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Call ID</span><span className="font-medium">{call.callId}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Call Type</span><span className="font-medium">{(call as any).callType || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created By</span><span className="font-medium">{(call as any).createdBy || "—"}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Created</span><span className="font-medium text-right">{formatDateTime(call.dates.created)}</span></div>
              {call.dates.assigned && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Assigned</span><span className="font-medium text-right">{formatDateTime(call.dates.assigned)}</span></div>}
              {call.dates.travelStarted && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Travel Started</span><span className="font-medium text-right">{formatDateTime((call.dates as any).travelStarted)}</span></div>}
              {call.dates.reachedLocation && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Reached</span><span className="font-medium text-right">{formatDateTime((call.dates as any).reachedLocation)}</span></div>}
              {call.dates.inProgress && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Started</span><span className="font-medium text-right">{formatDateTime(call.dates.inProgress)}</span></div>}
              {call.dates.onHold && <div className="flex justify-between gap-4"><span className="text-muted-foreground">On Hold</span><span className="font-medium text-right">{formatDateTime(call.dates.onHold)}</span></div>}
              {call.dates.completed && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Completed</span><span className="font-medium text-right">{formatDateTime(call.dates.completed)}</span></div>}
              {call.dates.cancelled && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Cancelled</span><span className="font-medium text-right">{formatDateTime(call.dates.cancelled)}</span></div>}
              {call.priority && <div className="flex justify-between"><span className="text-muted-foreground">Priority</span><span className="font-medium">{call.priority}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Engineer</span><span className="font-medium">{call.engineerInfo?.name || "Unassigned"}</span></div>
              {(call as any).sendToEmail !== undefined && <div className="flex justify-between"><span className="text-muted-foreground">Send Email</span><span className="font-medium">{(call as any).sendToEmail ? "Yes" : "No"}</span></div>}
              {(call as any).sendToWhatsapp !== undefined && <div className="flex justify-between"><span className="text-muted-foreground">Send WhatsApp</span><span className="font-medium">{(call as any).sendToWhatsapp ? "Yes" : "No"}</span></div>}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm mt-6">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><StickyNote className="h-5 w-5" /> Admin Remarks</CardTitle></CardHeader>
            <CardContent>
              {call.note ? (
                <p className="text-sm whitespace-pre-wrap">{call.note}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No remarks added yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Status Timeline</CardTitle></CardHeader>
            <CardContent>
              <StatusTimeline steps={timelineSteps} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Full-width Machines Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Wrench className="h-5 w-5" /> Machines</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Machine Name</TableHead>
                  <TableHead>Serial No.</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Division</TableHead>
                  <TableHead>Contract Type</TableHead>
                  <TableHead>Problem Type</TableHead>
                  <TableHead>Issue Description</TableHead>
                  <TableHead>Customer Attachments</TableHead>
                  <TableHead>Engineer Attachments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {call.machines.map((machine, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium">{machine.machineName}</TableCell>
                    <TableCell className="font-mono text-sm">{machine.serialNumber || "N/A"}</TableCell>
                    <TableCell>{machine.modelNumber || "N/A"}</TableCell>
                    <TableCell>{machine.category || "N/A"}</TableCell>
                    <TableCell>{machine.division || "N/A"}</TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm min-w-[160px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium">{machine.contractType.name} ({machine.contractType.code})</p>
                          {(() => {
                            const isExpired = machine.contractType.validTo ? new Date() > new Date(machine.contractType.validTo) : false;
                            return (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${isExpired ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                {isExpired ? "Expired" : "Active"}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-muted-foreground">Free Service: {machine.contractType.freeService ? "Yes" : "No"}</p>
                        <p className="text-muted-foreground">Free Parts: {machine.contractType.freeParts ? "Yes" : "No"}</p>
                        <p className="text-muted-foreground">From: {formatDate(machine.contractType.validFrom)}</p>
                        <p className="text-muted-foreground">To: {formatDate(machine.contractType.validTo)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {machine.problemTypes && machine.problemTypes.length > 0 ? (
                        <span className="text-sm">{machine.problemTypes.join(", ")}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="text-sm">{machine.issueDescription}</p>
                    </TableCell>
                    <TableCell>
                      {machine.images && machine.images.length > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => setAttachmentsDialog({ machineName: machine.machineName, images: machine.images })}
                        >
                          <Paperclip className="h-3 w-3" />
                          {machine.images.length} attachment{machine.images.length > 1 ? "s" : ""}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-sm">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const engineerImgs = [
                          ...((call as any).beforeWorkImages || []),
                          ...((call as any).afterWorkImages  || []),
                        ];
                        return engineerImgs.length > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs"
                            onClick={() => setAttachmentsDialog({ machineName: `${machine.machineName} (Engineer)`, images: engineerImgs })}
                          >
                            <Paperclip className="h-3 w-3" />
                            {engineerImgs.length} attachment{engineerImgs.length > 1 ? "s" : ""}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">None</span>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* On Hold Reason */}
      {(call as any).onHoldReason && (
        <Card className="border-0 shadow-sm border-l-4 border-l-yellow-400">
          <CardHeader><CardTitle className="text-lg">On Hold Reason</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">{(call as any).onHoldReason}</p>
          </CardContent>
        </Card>
      )}

      {/* Counter Reading Section */}
      {(call as any).callType === "Counter-Reading" && call.machines.some((m: any) => m.counterReadings?.length > 0) && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wrench className="h-5 w-5" /> Counter Readings & Charges
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead>Serial No.</TableHead>
                    <TableHead>Pages Category</TableHead>
                    <TableHead className="text-right">Last Reading</TableHead>
                    <TableHead className="text-right">Current Reading</TableHead>
                    <TableHead className="text-right">Diff</TableHead>
                    <TableHead className="text-right">Cost / Page</TableHead>
                    <TableHead className="text-right">Charges (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {call.machines.flatMap((machine: any, mi: number) =>
                    (machine.counterReadings || []).flatMap((cr: any) =>
                      (cr.categories || []).map((cat: any, ci: number) => (
                        <TableRow key={`${mi}-${ci}`}>
                          <TableCell>{ci + 1}</TableCell>
                          <TableCell>
                            <p className="font-medium">{machine.machineName}</p>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{cr.serialNumber}</TableCell>
                          <TableCell>{cat.pagesCategory}</TableCell>
                          <TableCell className="text-right">{cat.lastReading}</TableCell>
                          <TableCell className="text-right">{cat.currentReading}</TableCell>
                          <TableCell className="text-right">{cat.diff}</TableCell>
                          <TableCell className="text-right">₹{cat.costPerPage}</TableCell>
                          <TableCell className="text-right font-semibold text-blue-600">₹{cat.chargesInRupees}</TableCell>
                        </TableRow>
                      ))
                    )
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-8 px-6 py-4 border-t text-sm">
              {(call as any).totalCounterReadingCharges !== undefined && (
                <div className="text-right">
                  <p className="text-muted-foreground">Total Counter Reading Charges</p>
                  <p className="text-blue-600 font-semibold text-base">₹{(call as any).totalCounterReadingCharges}</p>
                </div>
              )}
              {(call as any).totalCharges !== undefined && (
                <div className="text-right">
                  <p className="text-muted-foreground">Grand Total</p>
                  <p className="font-bold text-base">₹{(call as any).totalCharges}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parts Replaced Section */}
      {call.machines.some((m: any) => m.usedParts?.length > 0) && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wrench className="h-5 w-5" /> Parts Replaced
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Machine (Call)</TableHead>
                    <TableHead>Part Code</TableHead>
                    <TableHead>Part Name</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Selling Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {call.machines.flatMap((machine: any, mi: number) =>
                    (machine.usedParts || []).map((part: any, pi: number) => (
                      <TableRow key={`${mi}-${pi}`}>
                        <TableCell>{pi + 1}</TableCell>
                        <TableCell>
                          <p className="font-medium">{machine.machineName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{machine.serialNumber}</p>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{part.partCode}</TableCell>
                        <TableCell>
                          <p className="font-medium">{part.machineName}</p>
                        </TableCell>
                        <TableCell className="text-right">1</TableCell>
                        <TableCell className="text-right">₹{part.sellingPrice ?? part.discountedSellingPrice ?? 0}</TableCell>
                        <TableCell className="text-right font-semibold text-blue-600">₹{part.total}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charges Section */}
      {(call as any).callType !== "Counter-Reading" && call.machines.some(m => m.serviceCharge !== undefined || m.partsCharge !== undefined) && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="text-base">₹</span> Charges
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead>Serial No.</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead className="text-right">Service Charge</TableHead>
                    <TableHead className="text-right">Parts Charge</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {call.machines.map((machine, index) => {
                    const sc = machine.serviceCharge ?? 0;
                    const pc = machine.partsCharge ?? 0;
                    const hasCharge = machine.serviceCharge !== undefined || machine.partsCharge !== undefined;
                    if (!hasCharge) return null;
                    return (
                      <TableRow key={index}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{machine.machineName}</TableCell>
                        <TableCell className="font-mono text-sm">{machine.serialNumber}</TableCell>
                        <TableCell className="text-sm">{machine.contractType.name}</TableCell>
                        <TableCell className="text-right">
                          {machine.serviceCharge !== undefined
                            ? <span className="text-green-600 font-medium">₹{machine.serviceCharge}</span>
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {machine.partsCharge !== undefined
                            ? <span className="text-blue-600 font-medium">₹{machine.partsCharge}</span>
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-semibold">₹{sc + pc}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-8 px-6 py-4 border-t text-sm">
              {call.totalServiceCharges !== undefined && (
                <div className="text-right">
                  <p className="text-muted-foreground">Total Service Charges</p>
                  <p className="text-green-600 font-semibold text-base">₹{call.totalServiceCharges}</p>
                </div>
              )}
              {call.totalPartsCharges !== undefined && (
                <div className="text-right">
                  <p className="text-muted-foreground">Total Parts Charges</p>
                  <p className="text-blue-600 font-semibold text-base">₹{call.totalPartsCharges}</p>
                </div>
              )}
              {(call.totalServiceCharges !== undefined || call.totalPartsCharges !== undefined) && (
                <div className="text-right">
                  <p className="text-muted-foreground">Grand Total</p>
                  <p className="font-bold text-base">₹{(call as any).totalCharges ?? ((call.totalServiceCharges ?? 0) + (call.totalPartsCharges ?? 0))}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Work Images + Customer Signature */}
      {((call as any).beforeWorkImages?.length > 0 || (call as any).afterWorkImages?.length > 0 || (call as any).customerSignature) && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Paperclip className="h-5 w-5" /> Work Images & Signature</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(call as any).beforeWorkImages?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Before Work</p>
                  <div className="flex flex-wrap gap-2">
                    {(call as any).beforeWorkImages.map((img: string, i: number) => (
                      <a key={i} href={img} target="_blank" rel="noopener noreferrer">
                        <img src={img} alt={`Before ${i + 1}`} className="h-28 w-28 object-cover rounded border hover:opacity-90 transition-opacity" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {(call as any).afterWorkImages?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">After Work</p>
                  <div className="flex flex-wrap gap-2">
                    {(call as any).afterWorkImages.map((img: string, i: number) => (
                      <a key={i} href={img} target="_blank" rel="noopener noreferrer">
                        <img src={img} alt={`After ${i + 1}`} className="h-28 w-28 object-cover rounded border hover:opacity-90 transition-opacity" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {(call as any).customerSignature && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Customer Signature</p>
                  <a href={(call as any).customerSignature} target="_blank" rel="noopener noreferrer">
                    <img src={(call as any).customerSignature} alt="Customer Signature" className="h-28 object-contain rounded border hover:opacity-90 transition-opacity bg-white p-1" />
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attachments Dialog */}
      <Dialog open={!!attachmentsDialog} onOpenChange={() => setAttachmentsDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Attachments — {attachmentsDialog?.machineName}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
            {attachmentsDialog?.images.map((img, i) => (
              <a key={i} href={img} target="_blank" rel="noopener noreferrer">
                <img src={img} alt={`Attachment ${i + 1}`} className="w-full h-40 object-cover rounded border hover:opacity-90 transition-opacity" />
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Engineer Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{call.status === "Open" ? "Assign Engineer" : "Reassign Engineer"} — {call.callId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>Select Engineer</Label>
            <Select value={selectedEngineerId} onValueChange={setSelectedEngineerId}>
              <SelectTrigger><SelectValue placeholder="Choose engineer" /></SelectTrigger>
              <SelectContent>
                {engineers.map((e) => (
                  <SelectItem key={e._id} value={e._id}>
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${e.isOnline ? "bg-green-500" : "bg-gray-300"}`} />
                      {e.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>Cancel</Button>
            <Button
              disabled={!selectedEngineerId || saving}
              onClick={async () => {
                if (!id) return;
                setSaving(true);
                try {
                  await serviceCallsApi.assignEngineer(id, selectedEngineerId);
                  toast({ title: "Engineer Assigned", description: `Engineer assigned to ${call.callId}` });
                  queryClient.invalidateQueries({ queryKey: ["serviceCall", id] });
                  setAssignDialog(false);
                } catch {
                  toast({ title: "Error", description: "Failed to assign engineer", variant: "destructive" });
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={noteDialog} onOpenChange={setNoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin Remarks — {call.callId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>Note</Label>
            <Textarea placeholder="Enter note..." value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog(false)}>Cancel</Button>
            <Button
              disabled={!note.trim() || saving}
              onClick={async () => {
                if (!id) return;
                setSaving(true);
                try {
                  await serviceCallsApi.updateCall(id, { note });
                  toast({ title: "Note Saved", description: "Note saved successfully" });
                  queryClient.invalidateQueries({ queryKey: ["serviceCall", id] });
                  setNoteDialog(false);
                  setNote("");
                } catch {
                  toast({ title: "Error", description: "Failed to save note", variant: "destructive" });
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving..." : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Priority Dialog */}
      <Dialog open={priorityDialog} onOpenChange={setPriorityDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Priority — {call.callId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>Priority</Label>
            <Select value={selectedPriority} onValueChange={setSelectedPriority}>
              <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriorityDialog(false)}>Cancel</Button>
            <Button
              disabled={!selectedPriority || saving}
              onClick={async () => {
                if (!id) return;
                setSaving(true);
                try {
                  await serviceCallsApi.updateCall(id, { priority: selectedPriority });
                  toast({ title: "Priority Set", description: `Priority set to ${selectedPriority}` });
                  queryClient.invalidateQueries({ queryKey: ["serviceCall", id] });
                  setPriorityDialog(false);
                } catch {
                  toast({ title: "Error", description: "Failed to set priority", variant: "destructive" });
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default CallDetailsPage;
