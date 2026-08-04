import React from "react";
import type { VariantProps } from "class-variance-authority";
import { Table, type TableData } from "@/components/ui/table";
import { Badge, badgeVariants } from "@/components/ui/badge";
import Sidebar from "@/components/ui/sidebar";
import Link from "next/link";
import durations from "@/data/courseDurations.json";
import requirements from "@/data/programRequirements.json";
import courses from "@/data/courses.json";

const Guide: React.FC = () => {
  return (
    <main className="min-h-screen py-16">
      <div className="max-w-6xl mx-auto flex gap-16 px-6">
        {/* LEFT SIDEBAR */}
        <Sidebar />

        {/* MAIN CONTENT */}
        <div className="flex-1 max-w-full md:max-w-3xl">
          {/* HERO */}
          <section id="introduction" className="mb-16">
            <h1 className="text-4xl font-bold mb-6">Brock CS Student Guide</h1>

            <div className="border-l-4 border-[#9A4440] pl-6 text-neutral-600 text-lg">
              Hello there, We are thrilled to have you here! Whether you&apos;re
              new or returning, our mission is to empower students with the
              skills, knowledge, and connections necessary to excel in Computer
              Science (CS) and enhance their university experience. We achieve
              this through workshops on trending technologies,
              community-building activities, and opportunities to apply your
              knowledge in real-world scenarios.<br></br>
              <br></br>
              This guide is designed to help you successfully navigate the CS
              seas as a student at Brock University .<br></br>
              <br></br>
              Throughout the guide, we will review everything you need to know
              about the Computer Science Program. This is an open-source guide
              for Computer Science students at Brock University. We encourage
              and appreciate everyone’s contributions to its continuous growth
              and development.<br></br>
              <br></br>
            </div>
          </section>

          {/* COURSE REGISTRATION */}
          <section id="registration" className="mb-12">
            <h1 className="text-4xl font-bold mb-6">Course Registration</h1>

            <div className="border-l-4 border-[#9A4440] pl-6 text-neutral-600 text-lg">
              As a first-year student, one of your first tasks is to register
              for your courses. This section is here to guide you through that
              process.
              <br />
              <br />
              Start by checking the course requirements in the{" "}
              <a
                className="underline text-red-800 hover:decoration-2"
                href="https://calendar.brocku.ca/"
              >
                undergraduate calendar
              </a>
              . Familiarise yourself with the page, including program notes and
              hyperlinks, to get comfortable with the layout and information.
              <br />
              <br />
            </div>
          </section>

          {/* COURSE CODES  */}
          <section id="course-codes" className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border-2 border-[#9A4440]" />
              Course Codes
            </h2>

            <div className="border-l-4 border-[#9A4440] pl-6 text-neutral-600 text-lg mb-8">
              In your course requirements, you will see a bunch of course codes
              and it is crucial to know how these courses are structured.
              <br />
              <br />
              For Example: The COSC 1P02 course code can be broken down as,
              <br />
              <br />
            </div>

            <div className="space-y-4">
              <CourseRow
                code="COSC"
                title="The department which is offering the course."
                badges={[]}
              />
              <CourseRow
                code="1"
                title="Indicates the year the course is intended for."
                badges={[]}
              />
              <CourseRow
                code="P"
                title="Represents the number of credits you get for completing the course."
                badges={[]}
              />
              <CourseRow
                code="02"
                title="Department code for the specific course."
                badges={[]}
              />
            </div>
          </section>

          {/* CREDIT BREAKDOWN */}
          <section id="common-course-types" className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border-2 border-[#9A4440]" />
              Common Course Types
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* FULL CREDIT */}
              <div className="relative bg-white border-2 border-black rounded-2xl p-8 shadow-[4px_4px_0_#000]">
                <div className="absolute -top-4 left-6 bg-white border-2 border-black px-3 py-1 rounded-full shadow-[2px_2px_0_#000] font-semibold">
                  F
                </div>

                <h3 className="text-xl font-semibold mb-4 mt-4">
                  Full-Credit Course
                </h3>

                <p className="text-neutral-600">
                  Full-credit courses run through both Fall and Winter semesters
                  (D1 duration). Some intensive thesis or project courses are
                  weighted as 1.0 credits.
                </p>
              </div>

              {/* HALF CREDIT */}
              <div className="relative bg-white border-2 border-black rounded-2xl p-8 shadow-[4px_4px_0_#000]">
                <div className="absolute -top-4 left-6 bg-[#9A4440] text-white border-2 border-black px-3 py-1 rounded-full shadow-[2px_2px_0_#000] font-semibold">
                  P/Q
                </div>

                <h3 className="text-xl font-semibold mb-4 mt-4">
                  Half-Credit Course
                </h3>

                <p className="text-neutral-600">
                  Most courses at Brock are 0.5 credits. These typically run for
                  one semester (12 weeks). You need 20.0 credits total to
                  graduate with an Honours degree.Q is the same thing, it is
                  used for cross-listed courses.
                </p>
              </div>

              {/* COOP CREDIT */}
              <div className="relative bg-white border-2 border-black rounded-2xl p-8 shadow-[4px_4px_0_#000]">
                <div className="absolute -top-4 left-6 bg-[#9A4440] text-white border-2 border-black px-3 py-1 rounded-full shadow-[2px_2px_0_#000] font-semibold">
                  C
                </div>

                <h3 className="text-xl font-semibold mb-4 mt-4">
                  Coop-Credit Course
                </h3>

                <p className="text-neutral-600">
                  Only required for co-op, and the credit is only weighted for
                  OSAP but does not apply to your graduation requirement
                </p>
              </div>
              {/* COOP CREDIT */}
              <div className="relative bg-white border-2 border-black rounded-2xl p-8 shadow-[4px_4px_0_#000]">
                <div className="absolute -top-4 left-6 bg-[#9A4440] text-white border-2 border-black px-3 py-1 rounded-full shadow-[2px_2px_0_#000] font-semibold">
                  N
                </div>

                <h3 className="text-xl font-semibold mb-4 mt-4">
                  No-Credit Course
                </h3>

                <p className="text-neutral-600">Only required for co-op</p>
              </div>
            </div>
            <div className="mt-6 border border-yellow-400 bg-yellow-50 rounded-xl px-6 py-4 text-sm text-yellow-800">
              ⚠ Note: Every Major program requires 20 credits to graduate.{" "}
            </div>
          </section>

          {/* Course Durations*/}
          <section id="course-duration" className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border-2 border-[#9A4440]" />
              Course Durations
            </h2>
            <div className="border-l-4 border-[#9A4440] pl-6 text-neutral-600 text-lg mb-8">
              Courses are offered during various times throughout the year and
              it is important to know which duration refers to which time
              period. <br></br>
              <br></br>
            </div>
            <Table data={durations as TableData} mobileVariant="stack" />
          </section>

          {/* Sections*/}
          <section id="course-sections" className="mb-8">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border-2 border-[#9A4440]" />
              Sections
            </h2>
            <div className="border-l-4 border-[#9A4440] pl-6 text-neutral-600 text-lg mb-8">
              Some courses are large and divided into sections for lectures,
              seminars, labs, or marking purposes. Sections might have different
              instructors but cover the same material. If you want to be in the
              same class as a friend, make sure to enrol in the same section.
              <br></br>
              <br></br>
            </div>
          </section>

          {/* Context Credits*/}
          <section id="context-credits" className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border-2 border-[#9A4440]" />
              Context Credits
            </h2>
            <div className="border-l-4 border-[#9A4440] pl-6 text-neutral-600 text-lg mb-8">
              All students must include one credit (or two half-credits) from
              the list of Humanities, Social Sciences and Sciences Context
              Courses to fulfil their degree requirements.
              <a
                className="underline text-red-800 hover:decoration-2"
                href="https://brocku.ca/webcal/current/undergrad/areg.html#sec29"
              >
                Context Courses
              </a>{" "}
              are mandatory courses intended to provide you with a broad
              educational background. For Computer Science students, the science
              context credit is covered by the program requirements, so since
              you are here you&apos;ll most likely need to focus on Humanities
              and Social Sciences context credits.<br></br>
              <br></br>
              Students in four-year Honours professional programs must fulfil
              context requirements by the end of the third year of the program.
              All other students must have completed all three required context
              courses within the first 10 credits. You can find the list of
              context credits{" "}
              <a
                className="underline text-red-800 hover:decoration-2"
                href="https://brocku.ca/webcal/current/undergrad/areg.html#sec29"
              >
                here
              </a>
              . <br></br>
              <br></br>
              <div className="mt-6 border border-yellow-400 bg-yellow-50 rounded-xl px-6 py-4 text-sm text-yellow-800 mb-8">
                ⚠ Note: This should be cross referenced with the{" "}
                <a
                  className="underline text-red-800 hover:decoration-2"
                  href="https://brocku.ca/guides-and-timetables/timetables/?session=fw&type=ug&level=all"
                >
                  undergraduate timetable
                </a>
                , as sometimes the courses listed here are not always offered.
              </div>
              You can use the Course Planning Tool in your my.brocku.ca student
              portal to check out all the courses that satisfy a particular
              context credit and check whether there’s space available, it’s
              waitlisted or it’s full. <br></br>
              <br></br>
              <div className="mt-6 border border-blue-400 bg-blue-50 rounded-xl px-6 py-4 text-sm text-blue-800 mb-8">
                ⚠ Tip: When selecting a context credit, make sure to read the
                course description and see that you are interested in the
                course. We understand that sometimes you just want to learn
                about your major but they are intended to provide you with a
                broad educational background. Sometimes, it can get frustrating
                trying to find a context credit that fits your schedule but we
                highly recommend spending time on this decision. An extra 15
                minutes on this can drastically change your overall experience
                for the next semester or even the entire academic year. (In
                Jay’s opinion, most of the time there’s no point in taking a
                bird course, it’s a waste of time and money.)
              </div>
            </div>
          </section>

          {/* Program Requirements*/}
          <section id="requirements" className="mb-20">
            <h1 className="text-4xl font-bold mb-6">Program Requirements</h1>
            <h2
              id="bachelor"
              className="text-2xl font-bold mb-8 flex items-center gap-3"
            >
              <span className="w-4 h-4 rounded-full border-2 border-[#9A4440]" />
              Credit Requirements for Bahelors of Science, Computer Science
            </h2>

            <Table data={requirements as TableData} mobileVariant="scroll" />

            <div className="mt-6 border border-yellow-400 bg-yellow-50 rounded-xl px-6 py-4 text-sm text-yellow-800 mb-8">
              ⚠ Note: These requirements are subject to change. If you&apos;re
              in a specialized major then this could be different for you. Use
              this chart in tandem with the{" "}
              <a
                className="underline text-red-800 hover:decoration-2"
                href="https://calendar.brocku.ca/"
              >
                course calendar
              </a>{" "}
              to achieve your degree requirements.
            </div>
          </section>

          {/* Minor in Applied Computing*/}
          <section id="minor-computing" className="mb-8">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border-2 border-[#9A4440]" />
              Minor in Applied Computing
            </h2>
            <div className="border-l-4 border-[#9A4440] pl-6 text-neutral-600 text-lg mb-8">
              <div className="mt-6 border border-yellow-400 bg-yellow-50 rounded-xl px-6 py-4 text-sm text-yellow-800 mb-8">
                ⚠ Note: This is the only minor that the CS Department offers.
              </div>
              Students in other disciplines may obtain a minor in Applied
              Computing within their degree program by completing the following
              courses with a minimum 60 percent overall average: <br></br>
              <br></br>
              Four APCO and/or COSC credits. <br></br>
              <br></br>
              The applied computing minor is not available to Computer Science
              students of any kind, and APCO classes are only available to COSC
              students if they are cross listed as COSC classes, e.g. APCO 2P89
              Internet Technologies is also COSC 2P89. <br></br>
              <br></br>
            </div>
          </section>

          {/* Double Major*/}
          <section id="double-major" className="mb-8">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border-2 border-[#9A4440]" />
              Double Major
            </h2>

            <div className="border-l-4 border-[#9A4440] pl-6 text-neutral-600 text-lg mb-8">
              Consider a double major program as this might allow you to have
              more direction in your non-core computer science courses, and it
              may serve the advantage of allowing you to bypass courses such as
              MATH1P06 and COSC4P61, and of course add more qualifications to
              your resume. A popular pathway is the Computing and Business
              degree, however you can pair computer science with most programs
              in sciences, humanities, social sciences, and arts. <br></br>
              <br></br>
              <Link
                className="underline text-red-800 hover:decoration-2"
                href="https://calendar.brocku.ca/preview_program.php?catoid=23&poid=10350"
              >
                Double Major info
              </Link>{" "}
              <br></br>
              <a
                className="underline text-red-800 hover:decoration-2"
                href="https://brocku.ca/programs/undergraduate/computing-and-business/"
              >
                Computing and Business
              </a>{" "}
              <br></br>
            </div>
          </section>

          {/* Courses*/}
          <section id="courses" className="mb-20">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border-2 border-[#9A4440]" />
              Courses
            </h2>

            <div className="border-l-4 border-[#9A4440] pl-6 text-neutral-600 text-lg mb-8">
              This is a list of all required COSC courses, their pre-requeisites
              and the terms that they are generally offered in.<br></br>
              <br></br>
            </div>
            <div className="mt-6 border border-yellow-400 bg-yellow-50 rounded-xl px-6 py-4 text-sm text-yellow-800 mb-8">
              ⚠ Note: Do not rely on this alone, For the most up-to-date
              information, consult: <br></br>
              <br></br>
              <a
                className="underline text-red-800 hover:decoration-2"
                href="https://brocku.ca/guides-and-timetables/timetables/?session=fw&type=ug&level=all"
              >
                BrockU Time table
              </a>{" "}
              <br></br>
              <a
                className="underline text-red-800 hover:decoration-2"
                href="https://brocku.ca/webcal/current/undergrad/cosc.html"
              >
                Course Calendar
              </a>{" "}
              <br></br>
              <br></br>
              Not all classes are listed here, just classes that are required
              for the completion of Bsc with a major in Computer Science, e.g. a
              class that hasn&apos;t been offered in more than two years
              won&apos;t be here
            </div>

            <Table data={courses as TableData} mobileVariant="stack" />

            <div className="border-l-4 border-[#9A4440] pl-6 text-neutral-600 text-lg mb-8 mt-8">
              Here are some other helpful links, <br></br>
              <br></br>
              <ul>
                <li>
                  <a
                    className="underline text-red-800 hover:decoration-2"
                    href=""
                  >
                    List of different degrees and specializations in Computer
                    Science with their course requirements.
                  </a>
                </li>
                <li>
                  <a
                    className="underline text-red-800 hover:decoration-2"
                    href=""
                  >
                    Computer Science Department website.
                  </a>
                </li>
              </ul>
            </div>
          </section>

          {/* ADDITIONAL RESOURCES AND OPPORTUNITIES (PARENT INTRO ONLY) */}
          <section id="resources-oportunities" className="mb-16">
            <h1 className="text-4xl font-bold mb-6">
              Additional Resources and Opportunities
            </h1>
          </section>

          {/* RESOURCES */}
          <section id="resources" className="mb-10">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border-2 border-[#9A4440]" />
              Resources
            </h2>

            <div className="border-l-4 border-[#9A4440] pl-6 text-neutral-600 text-lg mb-8">
              <strong>Computer Science Club</strong>
              <br />
              <br />A great place to start and get a student&apos;s perspective
              on things and to stay up to date about the latest opportunities is
              by keeping in touch with the Computer Science Club. Make sure to
              follow us on{" "}
              <a
                className="underline text-red-800 hover:decoration-2"
                href="https://www.instagram.com/brockcsc/"
              >
                Instagram
              </a>{" "}
              and join our{" "}
              <a
                className="underline text-red-800 hover:decoration-2"
                href="https://discord.gg/a8nWyZAY9T"
              >
                Discord
              </a>{" "}
              to stay connected.
              <br />
              <br />
              <strong>Computer Science Help Desk</strong>
              <br />
              <br />
              The Computer Science Department hosts a Help Desk in MCJ 328. This
              allows you to receive one-on-one support for any Computer Science
              course-related questions. The Help Desk schedule can be found{" "}
              <a
                className="underline text-red-800 hover:decoration-2"
                href="http://brocku.ca/mathematics-science/computer-science/helpdesk_schedule/"
              >
                here
              </a>
              .
              <br />
              <br />
              <strong>Learning Services</strong>
              <br />
              <br />
              Learning Services increases academic success and retention of all
              students at Brock University. Check them out{" "}
              <a
                className="underline text-red-800 hover:decoration-2"
                href="https://brocku.ca/student-life-success/learning-services/"
              >
                here
              </a>
              .
              <br />
              <br />
              <strong>Professors</strong>
              <br />
              <br />
              One of the most underrated resources. Don’t hesitate to reach out,
              attend office hours, and ask questions.
              <br />
              <br />
              <strong>Goodies</strong>
              <br />
              <br />
              Many free trials and tools are available to you as a CS student:
              <br />
              <br />
              <ul>
                <li>
                  <a
                    className="underline text-red-800 hover:decoration-2"
                    href="https://brocku.ca/information-technology/office-365-log-in/"
                  >
                    Office 365
                  </a>{" "}
                  - Free access + 5TB OneDrive
                </li>
                <li>
                  <a
                    className="underline text-red-800 hover:decoration-2"
                    href="https://education.github.com/pack"
                  >
                    GitHub Student Developer Pack
                  </a>
                </li>
                <li>
                  <a
                    className="underline text-red-800 hover:decoration-2"
                    href="https://www.linkedin.com/learning/"
                  >
                    LinkedIn Learning
                  </a>
                </li>
                <li>
                  <a
                    className="underline text-red-800 hover:decoration-2"
                    href="https://www.studentappcentre.com/App/1Password"
                  >
                    1Password Trial
                  </a>
                </li>
                <li>
                  <a
                    className="underline text-red-800 hover:decoration-2"
                    href="https://www.amazon.ca/amazonprime?primeCampaignId=studentWlpPrimeRedir"
                  >
                    Amazon Prime Student
                  </a>
                </li>
                <li>
                  <a
                    className="underline text-red-800 hover:decoration-2"
                    href="https://www.figma.com/education/"
                  >
                    Figma
                  </a>
                </li>
                <li>
                  <a
                    className="underline text-red-800 hover:decoration-2"
                    href="https://www.spotify.com/ca-en/student/"
                  >
                    Spotify Student
                  </a>
                </li>
                <li>Local student discounts (e.g., Rogers Wireless)</li>
              </ul>
            </div>
          </section>

          {/* OPPORTUNITIES */}
          <section id="opportunities" className="mb-16">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border-2 border-[#9A4440]" />
              Opportunities
            </h2>

            <div className="border-l-4 border-[#9A4440] pl-6 text-neutral-600 text-lg mb-8">
              <strong>Experience BU</strong>
              <br />
              <br />
              Find events, volunteering, and workshops.{" "}
              <a
                className="underline text-red-800 hover:decoration-2"
                href="https://experiencebu.brocku.ca/"
              >
                Check it out here
              </a>
              .
              <br />
              <br />
              <strong>CareerZone</strong>
              <br />
              <br />
              Apply for on-campus jobs and build transferable skills.{" "}
              <a
                className="underline text-red-800 hover:decoration-2"
                href="https://careerzone.brocku.ca/myAccount/dashboard.htm"
              >
                Visit CareerZone
              </a>
              .
              <br />
              <br />
              <div className="mt-6 border border-blue-400 bg-blue-50 rounded-xl px-6 py-4 text-sm text-blue-800">
                ⚠ Quick Tip: Most job postings for next year appear in
                January/February. Also check{" "}
                <a
                  className="underline text-red-800 hover:decoration-2"
                  href="https://brocku.wd3.myworkdayjobs.com/brocku_careers"
                >
                  Workday
                </a>{" "}
                for TA roles and other listings.
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};

export default Guide;

/* ---------- SMALL COURSE ROW COMPONENT ---------- */

type CourseRowProps = {
  code: string;
  title: string;
  badges: {
    label: string;
    variant?: VariantProps<typeof badgeVariants>["variant"];
  }[];
};

function CourseRow({ code, title, badges }: CourseRowProps) {
  return (
    <div className="flex items-center justify-between bg-white border-2 border-black rounded-xl px-6 py-4 shadow-[3px_3px_0_#000]">
      <div className="flex items-center gap-4">
        <div className="border-black bg-red-900 border-1 text-white text-xs font-bold px-3 py-1 rounded-md">
          {code}
        </div>
        <span className="font-medium">{title}</span>
      </div>

      <div className="flex gap-3">
        {badges.map((badge, i) => (
          <Badge key={i} variant={badge.variant || "default"} size="sm">
            {badge.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}
