import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { serviceCallsApi } from "@/services/serviceCallsApi";
import { engineers } from "@/data/dummyData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusTimeline } from "@/components/StatusTimeline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, User, Wrench, FileText, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
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
  const [note, setNote] = useState("");

  const { data: call, isLoading, isFetching } = useQuery({
    queryKey: ["serviceCall", id],
    queryFn: () => serviceCallsApi.getCallDetail(id!),
    enabled: !!id,
    staleTime: 0, // Always fetch fresh data
  });

  if (isLoading || isFetching) return <Spinner />;
  if (!call) return <div className="text-center py-12 text-muted-foreground">Call not found</div>;

  const timelineSteps = [
    { label: "Call Created", date: formatDate(call.dates.created), description: "Service call registered", completed: true },
    { label: "Engineer Assigned", date: formatDate(call.dates.assigned || ""), description: call.engineerInfo ? `Assigned to ${call.engineerInfo.name}` : undefined, completed: !!call.dates.assigned, active: call.status === "Assigned" },
    { label: "Work In Progress", date: formatDate(call.dates.inProgress || ""), description: "Engineer working on site", completed: !!call.dates.inProgress, active: call.status === "In Progress" },
    { label: "On Hold", date: formatDate(call.dates.onHold || ""), description: "Work paused", completed: !!call.dates.onHold, active: call.status === "On Hold" },
    { label: "Completed", date: formatDate(call.dates.completed || ""), description: "Issue resolved", completed: !!call.dates.completed },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{call.callId}</h1>
            <StatusBadge status={call.status} />
          </div>
          <p className="text-muted-foreground text-sm">{call.machines[0]?.issueDescription}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
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

          {call.machines.map((machine, index) => (
            <Card key={index} className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Wrench className="h-5 w-5" /> Machine Details {call.machines.length > 1 && `#${index + 1}`}</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><p className="text-muted-foreground">Machine</p><p className="font-medium">{machine.machineName}</p></div>
                  <div><p className="text-muted-foreground">Model</p><p className="font-medium">{machine.modelNumber || "N/A"}</p></div>
                  <div><p className="text-muted-foreground">Serial No.</p><p className="font-medium">{machine.serialNumber || "N/A"}</p></div>
                  <div><p className="text-muted-foreground">Division</p><p className="font-medium">{machine.division}</p></div>
                  <div><p className="text-muted-foreground">Category</p><p className="font-medium">{machine.category}</p></div>
                  <div><p className="text-muted-foreground">Problem Type</p><p className="font-medium">{machine.problemType || "N/A"}</p></div>
                  <div><p className="text-muted-foreground">Attribute</p><p className="font-medium">{machine.attributeName}: {machine.attributeValue}</p></div>
                  <div><p className="text-muted-foreground">Contract Type</p><p className="font-medium">{machine.contractType.name}</p></div>
                  <div><p className="text-muted-foreground">Contract Code</p><p className="font-medium">{machine.contractType.code}</p></div>
                  <div><p className="text-muted-foreground">Free Service</p><p className="font-medium">{machine.contractType.freeService ? "Yes" : "No"}</p></div>
                  <div><p className="text-muted-foreground">Free Parts</p><p className="font-medium">{machine.contractType.freeParts ? "Yes" : "No"}</p></div>
                </div>
                {machine.images && machine.images.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Images:</p>
                    <div className="flex gap-2 flex-wrap">
                      {machine.images.map((img, i) => (
                        <img key={i} src={img} alt={`Machine ${i + 1}`} className="h-20 w-20 object-cover rounded border" />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5" /> Issue Descriptions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {call.machines.map((machine, index) => (
                <div key={index}>
                  {call.machines.length > 1 && <p className="text-sm font-medium text-muted-foreground mb-1">Machine #{index + 1} - {machine.machineName}</p>}
                  <p className="text-sm">{machine.issueDescription}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Actions</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Assign Engineer</Label>
                  <Select defaultValue={call.engineerInfo?.name}>
                    <SelectTrigger><SelectValue placeholder="Select engineer" /></SelectTrigger>
                    <SelectContent>
                      {engineers.map((e) => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Update Status</Label>
                  <Select defaultValue={call.status}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="Assigned">Assigned</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="On Hold">On Hold</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {call.priority && (
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select defaultValue={call.priority}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Add Note</Label>
                <Textarea placeholder="Enter note..." value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => toast({ title: "Updated", description: "Call details saved" })}>Save Changes</Button>
                <Button variant="outline" className="gap-2">
                  <Upload className="h-4 w-4" /> Upload Images
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Status Timeline</CardTitle></CardHeader>
            <CardContent>
              <StatusTimeline steps={timelineSteps} />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Quick Info</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Call ID</span><span className="font-medium">{call.callId}</span></div>
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
        </div>
      </div>
    </div>
  );
};

export default CallDetailsPage;
