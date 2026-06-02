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
import { ArrowLeft, User, Wrench, Paperclip, UserPlus, UserCog, StickyNote, Flag, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import Spinner from "@/components/Spinner";

const formatDate = (dateString: string) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
  const [statusDialog, setStatusDialog] = useState(false);
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [selectedPriority, setSelectedPriority] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const [engineers, setEngineers] = useState<{ _id: string; name: string }[]>([]);

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
    { label: "Call Created", date: formatDate(call.dates.created), description: "Service call registered", completed: true },
    { label: "Engineer Assigned", date: formatDate(call.dates.assigned || ""), description: call.engineerInfo ? `Assigned to ${call.engineerInfo.name}` : undefined, completed: !!call.dates.assigned, active: call.status === "Assigned" },
    { label: "Work In Progress", date: formatDate(call.dates.inProgress || ""), description: "Engineer working on site", completed: !!call.dates.inProgress, active: call.status === "In Progress" },
    { label: "On Hold", date: formatDate(call.dates.onHold || ""), description: "Work paused", completed: !!call.dates.onHold, active: call.status === "On Hold" },
    { label: "Completed", date: formatDate(call.dates.completed || ""), description: "Issue resolved", completed: !!call.dates.completed },
  ];

  const statusOptions: Record<string, string[]> = {
    "Open":             ["Assigned", "Cancelled"],
    "Assigned":         ["Travel Started", "Cancelled"],
    "Travel Started":   ["Reached Location", "Cancelled"],
    "Reached Location": ["In Progress", "Cancelled"],
    "In Progress":      ["On Hold", "Completed", "Cancelled"],
    "On Hold":          ["In Progress", "Cancelled"],
  };

  const nextStatuses = statusOptions[call.status] ?? [];

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
          {nextStatuses.length > 0 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { setSelectedStatus(call.status); setStatusDialog(true); }}>
            <RefreshCw className="h-4 w-4" /> Update Status
          </Button>
          )}
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
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="font-medium">{formatDate(call.dates.created)}</span></div>
              {call.dates.assigned && <div className="flex justify-between"><span className="text-muted-foreground">Assigned</span><span className="font-medium">{formatDate(call.dates.assigned)}</span></div>}
              {call.dates.inProgress && <div className="flex justify-between"><span className="text-muted-foreground">Started</span><span className="font-medium">{formatDate(call.dates.inProgress)}</span></div>}
              {call.dates.onHold && <div className="flex justify-between"><span className="text-muted-foreground">On Hold</span><span className="font-medium">{formatDate(call.dates.onHold)}</span></div>}
              {call.dates.completed && <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><span className="font-medium">{formatDate(call.dates.completed)}</span></div>}
              {call.dates.cancelled && <div className="flex justify-between"><span className="text-muted-foreground">Cancelled</span><span className="font-medium">{formatDate(call.dates.cancelled)}</span></div>}
              {call.priority && <div className="flex justify-between"><span className="text-muted-foreground">Priority</span><span className="font-medium">{call.priority}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Engineer</span><span className="font-medium">{call.engineerInfo?.name || "Unassigned"}</span></div>
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
                  <TableHead>Variant</TableHead>
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
                    <TableCell>{machine.attributeName}: {machine.attributeValue}</TableCell>
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
                      {call.status !== "Open" ? (
                        <span className="text-muted-foreground text-sm italic">No attachments</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
                {engineers.map((e) => <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>)}
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

      {/* Update Status Dialog */}
      <Dialog open={statusDialog} onOpenChange={setStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Status — {call.callId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>Status</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={call.status} disabled>{call.status}</SelectItem>
                {nextStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(false)}>Cancel</Button>
            <Button
              disabled={selectedStatus === call.status || saving}
              onClick={async () => {
                if (!id) return;
                setSaving(true);
                try {
                  await serviceCallsApi.updateCall(id, { status: selectedStatus });
                  toast({ title: "Status Updated", description: `Status updated to ${selectedStatus}` });
                  queryClient.invalidateQueries({ queryKey: ["serviceCall", id] });
                  setStatusDialog(false);
                } catch {
                  toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CallDetailsPage;
