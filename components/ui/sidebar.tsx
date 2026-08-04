"use client";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

export default function Sidebar() {
  const [activeId, setActiveId] = useState("introduction");

  useEffect(() => {
    const sections = document.querySelectorAll("section[id]");

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = Array.from(entries)
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          const current = visible[0].target.id;
          setActiveId((prev) => (prev !== current ? current : prev));
        }
      },
      {
        rootMargin: "-50% 0px -50% 0px",
        threshold: 0,
      },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  const [isOpen, setIsOpen] = useState(false);

  const activeStyle = "bg-[#9A4440] text-white font-semibold";
  const defaultStyle =
    "bg-white text-black hover:translate-x-1 hover:translate-y-[1px]";

  const toggleMenu = () => setIsOpen(!isOpen);

  const handleNavClick = (id: string) => {
    setActiveId(id);
    setIsOpen(false);
  };

  const navItems = [
    { name: "Introduction", id: "introduction", indent: false },
    { name: "Course Registration", id: "registration", indent: false },
    { name: "Course Codes", id: "course-codes", indent: true },
    { name: "Common Course Types", id: "common-course-types", indent: true },
    { name: "Course Durations", id: "course-duration", indent: true },
    { name: "Sections", id: "course-sections", indent: true },
    { name: "Context Credits", id: "context-credits", indent: true },
    { name: "Program Requirements", id: "requirements", indent: false },
    { name: "Bachelor of Computer Science", id: "bachelor", indent: true },
    { name: "Minor in Applied Computing", id: "minor-computing", indent: true },
    { name: "Double Major", id: "double-major", indent: true },
    { name: "Courses", id: "courses", indent: true },
    {
      name: "Resources and Opportunities",
      id: "resources-oportunities",
      indent: false,
    },
    { name: "Resources", id: "resources", indent: true },
    { name: "Opportunities", id: "opportunities", indent: true },
  ];

  return (
    <>
      <button
        onClick={toggleMenu}
        className={`lg:hidden fixed right-4 z-50 p-2 bg-white border-2 border-black shadow-[3px_3px_0_#000] rounded-xl ${
          isOpen ? "top-5" : "top-25"
        }`}
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <aside
        className={`
        lg:block lg:sticky lg:top-24 lg:w-64 lg:h-fit shrink-0
        fixed inset-0 z-40 bg-white transition-transform duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "translate-x-full"}
        lg:translate-x-0 lg:static lg:bg-transparent
        w-full md:w-80 ml-auto lg:ml-0
      `}
      >
        <nav
          className={`
          space-y-2 p-6 lg:p-0 
          flex flex-col h-full 
          ${isOpen ? "justify-center items-center" : "justify-start"} lg:justify-start
        `}
        >
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={() => handleNavClick(item.id)}
              className={`
                    block rounded-xl border-2 border-black shadow-[3px_3px_0_#000] transition duration-200 text-center lg:text-left
                    ${
                      item.indent
                        ? "ml-6 w-[calc(100%-1.5rem)] text-sm px-2 py-1 my-1"
                        : "w-full px-4 py-3 lg:py-3 py-4 text-lg lg:text-base"
                    }
                    ${activeId === item.id ? activeStyle : defaultStyle}
                    `}
            >
              {item.name}
            </a>
          ))}
        </nav>
      </aside>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={toggleMenu}
        />
      )}
    </>
  );
}
