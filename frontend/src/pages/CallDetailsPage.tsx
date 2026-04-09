import { useParams, useNavigate } from "react-router-dom";
import { serviceCalls, engineers } from "@/data/dummyData";
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

const CallDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const call = serviceCalls.find((c) => c.id === id);
  const [note, setNote] = useState("");

  if (!call) return <div className="text-center py-12 text-muted-foreground">Call not found</div>;

  const timelineSteps = [
    { label: "Call Created", date: call.createdDate, description: "Service call registered", completed: true },
    { label: "Engineer Assigned", date: call.assignedDate, description: call.engineer !== "Unassigned" ? `Assigned to ${call.engineer}` : undefined, completed: !!call.assignedDate, active: call.status === "Assigned" },
    { label: "Work In Progress", date: call.startedDate, description: "Engineer working on site", completed: !!call.startedDate, active: call.status === "In Progress" },
    { label: "Completed", date: call.completedDate, description: "Issue resolved", completed: !!call.completedDate },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{call.id}</h1>
            <StatusBadge status={call.status} />
          </div>
          <p className="text-muted-foreground text-sm">{call.issue}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5" /> Customer Info</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted-foreground">Name</p><p className="font-medium">{call.customer}</p></div>
                <div><p className="text-muted-foreground">Email</p><p className="font-medium">{call.customerEmail}</p></div>
                <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{call.customerPhone}</p></div>
                <div><p className="text-muted-foreground">Address</p><p className="font-medium">{call.customerAddress}</p></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Wrench className="h-5 w-5" /> Machine Details</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><p className="text-muted-foreground">Machine</p><p className="font-medium">{call.machine}</p></div>
                <div><p className="text-muted-foreground">Model</p><p className="font-medium">{call.machineModel}</p></div>
                <div><p className="text-muted-foreground">Serial No.</p><p className="font-medium">{call.machineSerial}</p></div>
                <div><p className="text-muted-foreground">Division</p><p className="font-medium">{call.machineDivision}</p></div>
                <div><p className="text-muted-foreground">Category</p><p className="font-medium">{call.machineCategory}</p></div>
                <div><p className="text-muted-foreground">Problem Type</p><p className="font-medium">{call.problemType}</p></div>
                <div><p className="text-muted-foreground">Part Code</p><p className="font-medium">{call.partCode}</p></div>
                <div><p className="text-muted-foreground">HSN Code</p><p className="font-medium">{call.hsnCode}</p></div>
                <div><p className="text-muted-foreground">GST %</p><p className="font-medium">{call.gstPercentage}%</p></div>
                <div><p className="text-muted-foreground">Contract Type</p><p className="font-medium">{call.contractType}</p></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5" /> Issue Description</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm">{call.issue}</p>
              {call.notes.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Notes:</p>
                  {call.notes.map((n, i) => (
                    <div key={i} className="bg-muted/50 rounded-md p-3 text-sm">{n}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Actions</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Assign Engineer</Label>
                  <Select defaultValue={call.engineer !== "Unassigned" ? call.engineer : undefined}>
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
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Assigned">Assigned</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Call ID</span><span className="font-medium">{call.id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="font-medium">{call.createdDate}</span></div>
              {call.assignedDate && <div className="flex justify-between"><span className="text-muted-foreground">Assigned</span><span className="font-medium">{call.assignedDate}</span></div>}
              {call.startedDate && <div className="flex justify-between"><span className="text-muted-foreground">Started</span><span className="font-medium">{call.startedDate}</span></div>}
              {call.completedDate && <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><span className="font-medium">{call.completedDate}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Problem Type</span><span className="font-medium">{call.problemType}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Engineer</span><span className="font-medium">{call.engineer}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CallDetailsPage;
