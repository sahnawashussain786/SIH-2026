/**
 * Central icon registry — the single place where UI icons are chosen.
 * All icons come from react-icons (Feather for UI chrome, solid FA for states).
 * Pages import from here so the visual language stays consistent.
 */
export {
  // Navigation / chrome
  FiGrid as IconDashboard,
  FiUploadCloud as IconUpload,
  FiFileText as IconDocument,
  FiCheckSquare as IconVerification,
  FiArchive as IconRecords,
  FiSettings as IconAdmin,
  FiLogOut as IconLogout,
  FiMenu as IconMenu,
  FiX as IconClose,
  FiChevronLeft as IconChevronLeft,
  FiChevronRight as IconChevronRight,
  FiArrowRight as IconArrowRight,
  FiArrowLeft as IconArrowLeft,
  FiExternalLink as IconExternal,
  FiRefreshCw as IconRefresh,

  // KPIs / dashboard
  FiFileText as IconFiles,
  FiCheckCircle as IconApproved,
  FiClock as IconClock,
  FiClock as IconPending,
  FiAlertTriangle as IconIssues,
  FiMap as IconMap,
  FiTrendingUp as IconTrend,
  FiActivity as IconActivity,
  FiInfo as IconInfo,

  // Documents / upload
  FiUpload as IconUploadSimple,
  FiFile as IconFile,
  FiImage as IconImage,
  FiFolder as IconFolder,
  FiEye as IconEye,
  FiEdit3 as IconEdit,
  FiSave as IconSave,
  FiDownload as IconDownload,
  FiSearch as IconSearch,
  FiFilter as IconFilter,

  // Verification workflow
  FiCheck as IconCheck,
  FiCheckCircle as IconCheckCircle,
  FiX as IconX,
  FiXCircle as IconReject,
  FiThumbsUp as IconThumbsUp,
  FiShield as IconShield,
  FiAlertOctagon as IconError,
  FiAlertCircle as IconWarn,
  FiCopy as IconDuplicate,
  FiUserCheck as IconOfficer,
  FiUsers as IconUsers,
  FiClipboard as IconAudit,
  FiLock as IconLock,
  FiAward as IconBadge,
  FiGlobe as IconLanguage,
  FiCpu as IconAI,
  FiZap as IconBolt,
  FiPlus as IconPlus,
  FiKey as IconKey,
  FiUser as IconUser,
  FiMail as IconMail,
  FiHelpCircle as IconHelp,
  FiCalendar as IconCalendar,
  FiMapPin as IconPin,
  FiLayers as IconLayers,
  FiLoader as IconLoader,
} from 'react-icons/fi';

export {
  FaLandmark as IconLandmark,
  FaStamp as IconStamp,
  FaBalanceScale as IconBalance,
  FaCheckCircle as IconCheckSolid,
  FaExclamationCircle as IconWarnSolid,
  FaTimesCircle as IconErrorSolid,
  FaShieldAlt as IconShieldSolid,
} from 'react-icons/fa';
