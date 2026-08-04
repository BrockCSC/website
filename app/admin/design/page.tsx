import Callout from "@/components/ui/callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Calendar,
  Mail,
  Star,
  ArrowUpRight,
  Users,
  FileText,
  CalendarDays,
  Clock3,
  MapPin,
} from "lucide-react";

import { DiscordButton } from "@/components/ui/discord-button";
import { MemberBadge } from "@/components/ui/member-badge";
import { InfoCardButton } from "@/components/ui/info-card-button";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { EventCard } from "@/components/ui/event-card";

export default function DesignPage() {
  return (
    <div className="min-h-screen p-12 bg-zinc-50 flex flex-col gap-16 max-w-5xl mx-auto pb-24">
      {/* CALLOUTS SECTION */}
      <section>
        <h1 className="text-3xl font-bold mb-6 border-b pb-2 border-neutral-200">
          Callouts
        </h1>
        <div className="flex flex-col gap-1 max-w-2xl">
          <Callout
            type="info"
            message="This is an informational message to guide the user."
          />
          <Callout
            type="success"
            message="Your form has been submitted successfully!"
          />
          <Callout
            type="warning"
            message="Your session is about to expire. Please save your work."
          />
          <Callout
            type="error"
            message="Failed to load user data. Please try again later."
          />
        </div>
      </section>

      {/* BADGES SECTION */}
      <section>
        <h1 className="text-3xl font-bold mb-6 border-b pb-2 border-neutral-200">
          Badges
        </h1>
        <div className="flex flex-col gap-8">
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-600">
              Variants
            </h2>
            <div className="flex flex-wrap items-center gap-4">
              <Badge variant="default">Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="blue">Blue</Badge>
              <Badge variant="green">Green</Badge>
              <Badge variant="yellow">Yellow</Badge>
              <Badge variant="purple">Purple</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-600">
              With Icons & Sizes
            </h2>
            <div className="flex flex-wrap items-center gap-4">
              <Badge icon={<Star />} variant="yellow" size="lg">
                Featured
              </Badge>
              <Badge icon={<Calendar />} iconPosition="end" variant="green">
                Upcoming
              </Badge>
              <Badge icon={<Mail />} variant="blue" size="sm">
                Small Mail
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* BUTTONS SECTION */}
      <section>
        <h1 className="text-3xl font-bold mb-6 border-b pb-2 border-neutral-200">
          Buttons
        </h1>
        <div className="flex flex-col gap-8">
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-600">
              Variants & Icons
            </h2>
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="primary">Primary</Button>
              <Button variant="default">Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="primary">
                Join Discord <ArrowUpRight className="ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CLUB CUSTOM COMPONENTS SECTION */}
      <section>
        <h1 className="text-3xl font-bold mb-6 border-b pb-2 border-neutral-200">
          Club Custom Components
        </h1>
        <div className="flex flex-col gap-12">
          {/* Custom Buttons / Badges */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-600">
              Specialty Buttons & Badges
            </h2>
            <div className="flex flex-wrap items-center gap-6">
              <DiscordButton />
              <MemberBadge count="250+" />
            </div>
          </div>

          {/* Info Card Buttons */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-600">
              Info Card Buttons
            </h2>
            <div className="flex flex-wrap items-center gap-4 bg-white p-6 rounded-2xl border border-neutral-200">
              <InfoCardButton
                icon={Users}
                title="Meet the Team"
                subtitle="Learn about our execs"
                href="#"
              />
              <InfoCardButton
                icon={FileText}
                title="Club Charter"
                subtitle="Read our constitution"
                href="#"
              />
            </div>
          </div>

          {/* Photo Frame & Event Card Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            {/* Photo Frame */}
            <div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-600">
                Photo Frame
              </h2>
              <div className="w-full max-w-sm aspect-[4/3] pt-4 pr-6 pb-6 pl-4">
                <PhotoFrame
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2070&auto=format&fit=crop"
                  alt="Sample Club Photo"
                />
              </div>
            </div>

            {/* Event Card */}
            <div>
              <h2 className="text-xl font-semibold mb-4 text-neutral-600">
                Event Card
              </h2>
              <div className="w-full max-w-md">
                <EventCard
                  title="Game Night"
                  description="Join us at the Computer Science Help Desk (MCJ328) every Friday from 6PM to 8PM for a time of fun. We have a variety of board and video games ranging from Catan and Go to Super Smash Bros."
                  imageUrl="https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2000&auto=format&fit=crop"
                  tags={[
                    {
                      label: "FRIDAY",
                      icon: <CalendarDays strokeWidth={2.5} />,
                    },
                    {
                      label: "6:00 PM - 8:00 PM",
                      icon: <Clock3 strokeWidth={2.5} />,
                    },
                    { label: "MCJ328", icon: <MapPin strokeWidth={2.5} /> },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TABLE SECTION */}
      <section>
        <h1 className="text-3xl font-bold mb-6 border-b pb-2 border-neutral-200">
          Table
        </h1>
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-4">
          <Table>
            <TableCaption>A list of upcoming club events.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead>Event Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Oct 24</TableCell>
                <TableCell>Introduction to React Context</TableCell>
                <TableCell>Thistle 247</TableCell>
                <TableCell className="text-right">
                  <Badge variant="green" size="sm">
                    Confirmed
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Oct 31</TableCell>
                <TableCell>Halloween Game Jam</TableCell>
                <TableCell>Computer Commons</TableCell>
                <TableCell className="text-right">
                  <Badge variant="yellow" size="sm">
                    Planning
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
